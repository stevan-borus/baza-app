import { payrollSummaryResponseSchema } from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { parsePayrollMonthParams } from "@/lib/server/payroll-params";
import { readPayrollMonth } from "@/lib/server/payroll-month-read";
import { prisma } from "@/lib/server/prisma";

/**
 * GET /api/payroll/summary?year=&month=
 *
 * Every trainer's payout for the month — the owner's view for actually paying
 * people. ADMIN only: this is studio-wide financial data, and a trainer must
 * never see another trainer's figures (#123).
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const params = parsePayrollMonthParams(url.searchParams);
  if (!params) return fail("Invalid year/month", 400);

  const { from, to } = studioMonthRange(params.year, params.month);
  const asOf = now();

  const trainers = await prisma.user.findMany({
    where: { role: UserRole.TRAINER },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true },
  });

  // Per-trainer reads are independent, so run them together rather than
  // paying one round trip per trainer in series.
  const months = await Promise.all(
    trainers.map((trainer) =>
      readPayrollMonth(prisma, {
        trainerUserId: trainer.id,
        year: params.year,
        month: params.month,
        asOf,
      }),
    ),
  );

  return respond(payrollSummaryResponseSchema, {
    success: true,
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    trainers: months.map((m) => ({
      trainerUserId: m.trainerUserId,
      trainerName: m.trainerName,
      sessionCount: m.sessionCount,
      attendeeCount: m.attendeeCount,
      gross: m.gross,
      payout: m.payout,
      netPayout: m.netPayout,
      unpricedCount: m.unpricedCount,
      giftCount: m.giftCount,
      trialCount: m.trialCount,
    })),
    totalPayout: months.reduce((sum, m) => sum + m.netPayout, 0),
  });
}
