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

  const payment = await prisma.billingRecord.create({
    data: {
      clientUserId: parsed.data.clientUserId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      status: parsed.data.status,
      notes: parsed.data.notes,
    },
  });

  let clientPackage: null | {
    id: string;
    startsAt: Date;
    expiresAt: Date;
    sessionsRemaining: number;
  } = null;
  // Side effect: confirmed payment with packageTypeId can auto-create client package.
  if (
    parsed.data.status === "CONFIRMED" &&
    parsed.data.packageTypeId &&
    parsed.data.activatePackageOnConfirm
  ) {
    const [clientProfile, packageType] = await Promise.all([
      prisma.clientProfile.findUnique({
        where: { userId: parsed.data.clientUserId },
        select: { id: true },
      }),
      prisma.packageType.findUnique({
        where: { id: parsed.data.packageTypeId },
        select: {
          id: true,
          sessionCount: true,
          validityDays: true,
        },
      }),
    ]);

    if (clientProfile && packageType) {
      const startsAt = new Date();
      const expiresAt = new Date(
        startsAt.getTime() + packageType.validityDays * 24 * 60 * 60 * 1000,
      );
      clientPackage = await prisma.clientPackage.create({
        data: {
          clientProfileId: clientProfile.id,
          packageTypeId: packageType.id,
          startsAt,
          expiresAt,
          sessionsRemaining: packageType.sessionCount,
        },
        select: {
          id: true,
          startsAt: true,
          expiresAt: true,
          sessionsRemaining: true,
        },
      });
    }
  }

  return ok({ success: true, payment, clientPackage }, 201);
}
