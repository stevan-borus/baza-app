import {
  billingRecordInputSchema,
  billingResponseSchema,
  createBillingRecordResponseSchema,
} from "@baza/types/billing";
import { formatFullName, paginationQuerySchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { createClientPackageFromType } from "@/lib/server/client-package-create";
import { notifyClient } from "@/lib/server/notify-client";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@/generated/prisma";

// Shared filter builder for the Naplata list AND its summary aggregate, so the
// two never drift: the hero/count/avg span exactly the rows the list shows.
//
// `q` is tokenized on whitespace; each token must match the paying client's
// firstName/lastName OR the record's notes (case-insensitive), tokens ANDed so
// "First Last" narrows to one person. BillingRecord has no FK to User, so name
// matching resolves the token to matching user ids first, then filters
// clientUserId ∈ that set — one extra round-trip per request, acceptable for an
// admin-only screen. A token with no user match still matches via notes.
export async function buildBillingWhere(opts: {
  clientUserId?: string;
  from?: Date;
  to?: Date;
  q?: string;
}): Promise<Prisma.BillingRecordWhereInput> {
  const and: Prisma.BillingRecordWhereInput[] = [];

  if (opts.clientUserId) and.push({ clientUserId: opts.clientUserId });

  const fromValid = opts.from && !Number.isNaN(opts.from.getTime());
  const toValid = opts.to && !Number.isNaN(opts.to.getTime());
  if (fromValid || toValid) {
    const range: Prisma.DateTimeFilter = {};
    if (fromValid) range.gte = opts.from!;
    if (toValid) range.lt = opts.to!;
    and.push({ createdAt: range });
  }

  const tokens = opts.q ? opts.q.split(/\s+/).filter(Boolean) : [];
  for (const token of tokens) {
    const matchingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: token, mode: "insensitive" } },
          { lastName: { contains: token, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    and.push({
      OR: [
        { clientUserId: { in: matchingUsers.map((u) => u.id) } },
        { notes: { contains: token, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsedQuery = paginationQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsedQuery.success) return fail("Invalid query params", 400, parsedQuery.error);

  const clientUserId = url.searchParams.get("clientUserId") ?? undefined;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim() || undefined;
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const where = await buildBillingWhere({ clientUserId, from, to, q });

  // Cursor-based pagination: skip 1 after cursor to avoid duplicate.
  const payments = await prisma.billingRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(parsedQuery.data.cursor
      ? { cursor: { id: parsedQuery.data.cursor }, skip: 1 }
      : {}),
    take: parsedQuery.data.take,
  });

  // Resolve `client.fullName` for the page in one round-trip. BillingRecord
  // has no formal FK to User in the schema (clientUserId is just a string),
  // so we batch-fetch users for the page and join in-memory rather than
  // adding a migration for one read path. Admins need WHO paid on every
  // row, not just package/method/amount.
  const clientUserIds = Array.from(
    new Set(payments.map((p) => p.clientUserId)),
  );
  const users =
    clientUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: clientUserIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const records = payments.map((p) => {
    const u = userById.get(p.clientUserId);
    return {
      ...p,
      client: u
        ? { fullName: formatFullName(u.firstName, u.lastName), email: u.email }
        : null,
    };
  });

  return respond(billingResponseSchema, {
    success: true,
    records,
    nextCursor:
      payments.length === parsedQuery.data.take
        ? payments[payments.length - 1]?.id ?? null
        : null,
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, billingRecordInputSchema);
  if (!parsed.ok) return parsed.response;

  const status = parsed.data.status ?? "CONFIRMED";

  // TODO(billing): `activatePackageOnConfirm: false` is dead today — keep the
  // flag for a future "activate later" endpoint we haven't built yet.
  //
  // PENDING (pay-later) activates the package immediately by design: the
  // whole point of the workflow is that a client can book their return
  // sessions from vacation and settle the bill in person at the first
  // session back. Revenue reports ignore the record until it's CONFIRMED.
  const shouldActivatePackage =
    (status === "CONFIRMED" || status === "PENDING") &&
    !!parsed.data.packageTypeId &&
    parsed.data.activatePackageOnConfirm;

  let clientProfileId: string | null = null;
  let packageTypeRow: {
    id: string;
    name: string;
    sessionCount: number;
    validityDays: number;
    classTypeIds: string[];
    lateCancelHours: number;
  } | null = null;
  if (shouldActivatePackage) {
    const [clientProfile, packageType] = await Promise.all([
      prisma.clientProfile.findUnique({
        where: { userId: parsed.data.clientUserId },
        select: { id: true },
      }),
      prisma.packageType.findUnique({
        where: { id: parsed.data.packageTypeId! },
        select: {
          id: true,
          name: true,
          sessionCount: true,
          validityDays: true,
          lateCancelHours: true,
          classTypes: { select: { classTypeId: true } },
        },
      }),
    ]);
    if (!clientProfile) return fail("Client profile not found", 404);
    if (!packageType) return fail("Package type not found", 404);
    clientProfileId = clientProfile.id;
    const { classTypes, ...packageTypeScalars } = packageType;
    packageTypeRow = {
      ...packageTypeScalars,
      classTypeIds: classTypes.map((link) => link.classTypeId),
    };
  }

  // Validity start for the activated package: the admin's picked day when
  // provided (assign sheet + Naplata send local start-of-day), else the
  // payment instant.
  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : now();
  if (Number.isNaN(startsAt.getTime())) return fail("Invalid startsAt date", 400);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.billingRecord.create({
      data: {
        clientUserId: parsed.data.clientUserId,
        amount: parsed.data.amount,
        method: parsed.data.method,
        status,
        notes: parsed.data.notes,
        packageTypeId: parsed.data.packageTypeId ?? null,
      },
    });

    let clientPackage: Awaited<
      ReturnType<typeof createClientPackageFromType>
    > | null = null;
    if (shouldActivatePackage && clientProfileId && packageTypeRow) {
      clientPackage = await createClientPackageFromType(tx, {
        clientProfileId,
        packageType: packageTypeRow,
        startsAt,
      });

      // Wire the FK from the BillingRecord to the ClientPackage it activated.
      // Same transaction → both rows are atomic AND linked. Pre-FK rows
      // (status CONFIRMED, clientPackageId NULL) are handled by the
      // 20260519151739_backfill_billing_client_package_link migration and
      // the legacy chronological-zip fallback in lib/server/billing-package-link.
      await tx.billingRecord.update({
        where: { id: payment.id },
        data: { clientPackageId: clientPackage.id },
      });
    }

    return { payment, clientPackage };
  });

  // A package landed for the client — tell them it's active. Fire-and-forget:
  // a notification failure must never fail the payment that just committed.
  // Pay-later (PENDING) gets the payment-neutral assigned copy: the receipt
  // copy would claim a payment the client's own packages view still flags as
  // "Nije plaćeno".
  if (result.clientPackage && packageTypeRow) {
    void notifyClient({
      userId: parsed.data.clientUserId,
      event: status === "CONFIRMED" ? "PACKAGE_PURCHASED" : "PACKAGE_ASSIGNED",
      vars: { packageTypeName: packageTypeRow.name },
    });
  }

  return respond(
    createBillingRecordResponseSchema,
    { success: true, ...result },
    201,
  );
}
