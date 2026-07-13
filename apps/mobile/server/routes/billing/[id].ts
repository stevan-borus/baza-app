// PATCH /api/billing/[id] — confirm a pay-later (PENDING) payment.
//
// The only legal transition through this endpoint is PENDING → CONFIRMED:
// CONFIRMED records are immutable bookkeeping, and VOIDED records are the
// audit trail of a revoked package — resurrecting either through a PATCH
// would corrupt the revenue history. Method may be corrected at confirm
// time (the client may have promised cash but paid by card).
import {
  updateBillingRecordInputSchema,
  updateBillingRecordResponseSchema,
} from "@baza/types/billing";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = updateBillingRecordInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // Atomic claim (same pattern as the revoke route): the status guard lives
  // inside the UPDATE's WHERE so a concurrent revoke can't lose its VOIDED
  // stamp to this confirm — a check-then-update window would let a voided
  // record re-enter revenue.
  const claimed = await prisma.billingRecord.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "CONFIRMED",
      ...(parsed.data.method ? { method: parsed.data.method } : {}),
    },
  });
  if (claimed.count === 0) {
    const existing = await prisma.billingRecord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Billing record not found", 404);
    return fail("Only pending payments can be confirmed", 409);
  }

  const payment = await prisma.billingRecord.findUniqueOrThrow({
    where: { id },
  });

  return respond(updateBillingRecordResponseSchema, {
    success: true,
    payment,
  });
}
