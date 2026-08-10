import { payrollSummaryResponseSchema } from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { computePayrollMonth } from "@/lib/server/payroll";
import { parsePayrollMonthParams } from "@/lib/server/payroll-params";
import { readPayrollPeriod } from "@/lib/server/payroll-period";
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

  const months = [];
  for (const trainer of trainers) {
    months.push(
      await readPayrollPeriod(prisma, {
        trainerUserId: trainer.id,
        year: params.year,
        month: params.month,
        asOf,
        compute: computePayrollMonth,
      }),
    );
  }

  return respond(payrollSummaryResponseSchema, {
    success: true,
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    trainers: months.map((m) => ({
      trainerUserId: m.trainerUserId,
      trainerName: m.trainerName,
      percent: m.percent,
      status: m.status,
      sessionCount: m.sessionCount,
      attendeeCount: m.attendeeCount,
      gross: m.gross,
      payout: m.payout,
      netPayout: m.netPayout,
      unpricedCount: m.unpricedCount,
      giftCount: m.giftCount,
    })),
    totalPayout: months.reduce((sum, m) => sum + m.netPayout, 0),
  });
}
