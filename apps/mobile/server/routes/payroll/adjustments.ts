import {
  createPayrollAdjustmentInputSchema,
  createPayrollAdjustmentResponseSchema,
} from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, parseBody, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

/**
 * POST /api/payroll/adjustments — a manual correction on a month.
 *
 * Signed, so a negative amount deducts. Exists because the automatic
 * calculation cannot know about a bonus, a covered shift, or a agreed
 * one-off — without this the owner would be tempted to edit package prices to
 * make the total come out right, which would corrupt everyone else's figures.
 *
 * Allowed on a LOCKED period too: an adjustment is additive and leaves the
 * frozen lines untouched, so it is the safe way to correct a month that has
 * already been snapshotted.
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createPayrollAdjustmentInputSchema);
  if (!parsed.ok) return parsed.response;

  const { trainerUserId, year, month, amount, note } = parsed.data;
  const { from } = studioMonthRange(year, month);

  const trainer = await prisma.user.findUnique({
    where: { id: trainerUserId },
    select: { role: true },
  });
  if (!trainer) return fail("Trainer not found", 404);
  if (trainer.role !== UserRole.TRAINER) {
    return fail("User is not a trainer", 400);
  }

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      trainerUserId,
      periodStart: from,
      amount,
      note,
      createdByUserId: guard.user.id,
    },
    select: { id: true, amount: true, note: true, createdAt: true },
  });

  return respond(
    createPayrollAdjustmentResponseSchema,
    {
      success: true,
      adjustment: {
        ...adjustment,
        createdAt: adjustment.createdAt.toISOString(),
      },
    },
    201,
  );
}
