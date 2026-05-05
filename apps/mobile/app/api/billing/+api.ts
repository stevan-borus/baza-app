import { billingRecordInputSchema, paginationQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
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

  // Cursor-based pagination: skip 1 after cursor to avoid duplicate.
  const payments = await prisma.billingRecord.findMany({
    orderBy: { createdAt: "desc" },
    ...(parsedQuery.data.cursor
      ? { cursor: { id: parsedQuery.data.cursor }, skip: 1 }
      : {}),
    take: parsedQuery.data.take,
  });

  return ok({
    success: true,
    records: payments,
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

  // Recording payment in the admin form means "money received" — default to
  // CONFIRMED so the BillingRecord and ClientPackage stay in sync without
  // requiring the caller to pass `status` explicitly.
  const status = parsed.data.status ?? "CONFIRMED";

  // TODO(billing): `activatePackageOnConfirm: false` is currently dead — every
  //   live caller (admin billing form) sends true when a packageTypeId is
  //   selected. If we ever support "record payment, activate package later",
  //   we'll need a follow-up endpoint that activates a package against an
  //   existing BillingRecord. Until then the flag stays so the schema is
  //   compatible with future additions.
  const shouldActivatePackage =
    status === "CONFIRMED" &&
    !!parsed.data.packageTypeId &&
    parsed.data.activatePackageOnConfirm;

  // Pre-load the activation prerequisites OUTSIDE the transaction so we can
  // 4xx cleanly without writing a half-state. The actual create+create runs
  // atomically so a transient DB error during ClientPackage insert rolls back
  // the BillingRecord too.
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
      // Required for activation: classTypeId + lateCancelHours snapshot fields.
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

  const startsAt = new Date();
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
    }

    return { payment, clientPackage };
  });

  return ok({ success: true, ...result }, 201);
}
