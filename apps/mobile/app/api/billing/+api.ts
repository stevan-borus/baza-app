import { billingRecordInputSchema, formatFullName, paginationQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

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
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const where: Record<string, unknown> = {};
  if (clientUserId) where.clientUserId = clientUserId;
  const fromValid = from && !Number.isNaN(from.getTime());
  const toValid = to && !Number.isNaN(to.getTime());
  if (fromValid || toValid) {
    const range: Record<string, Date> = {};
    if (fromValid) range.gte = from!;
    if (toValid) range.lt = to!;
    where.createdAt = range;
  }

  // Cursor-based pagination: skip 1 after cursor to avoid duplicate.
  const payments = await prisma.billingRecord.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
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

  return ok({
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

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = billingRecordInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const status = parsed.data.status ?? "CONFIRMED";

  // TODO(billing): `activatePackageOnConfirm: false` is dead today — keep the
  // flag for a future "activate later" endpoint we haven't built yet.
  const shouldActivatePackage =
    status === "CONFIRMED" &&
    !!parsed.data.packageTypeId &&
    parsed.data.activatePackageOnConfirm;

  let clientProfileId: string | null = null;
  let packageTypeRow: {
    id: string;
    sessionCount: number;
    validityDays: number;
    classTypeId: string;
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
          sessionCount: true,
          validityDays: true,
          classTypeId: true,
          lateCancelHours: true,
        },
      }),
    ]);
    if (!clientProfile) return fail("Client profile not found", 404);
    if (!packageType) return fail("Package type not found", 404);
    clientProfileId = clientProfile.id;
    packageTypeRow = packageType;
  }

  const startsAt = now();
  const expiresAt = packageTypeRow
    ? new Date(
        startsAt.getTime() + packageTypeRow.validityDays * 24 * 60 * 60 * 1000,
      )
    : null;

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

    let clientPackage: {
      id: string;
      classTypeId: string;
      startsAt: Date;
      expiresAt: Date;
      sessionsRemaining: number;
    } | null = null;
    if (
      shouldActivatePackage &&
      clientProfileId &&
      packageTypeRow &&
      expiresAt
    ) {
      clientPackage = await tx.clientPackage.create({
        data: {
          clientProfileId,
          packageTypeId: packageTypeRow.id,
          classTypeId: packageTypeRow.classTypeId,
          lateCancelHours: packageTypeRow.lateCancelHours,
          startsAt,
          expiresAt,
          sessionsRemaining: packageTypeRow.sessionCount,
        },
        select: {
          id: true,
          classTypeId: true,
          startsAt: true,
          expiresAt: true,
          sessionsRemaining: true,
        },
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

  return ok({ success: true, ...result }, 201);
}
