import type { Prisma, PrismaClient } from "@/generated/prisma";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { computePayrollMonth } from "@/lib/server/payroll";
import type { PayrollMonth } from "@baza/types/payroll";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * One trainer's month in the API shape: the computed sessions plus any manual
 * adjustments.
 *
 * There is no period row and no locking. A payout line is frozen the moment
 * its session is consumed (see `recordConsumption`), so editing a package
 * price, revoking a package or removing a client afterwards has nothing left
 * to rewrite — which is what a monthly lock used to buy, without anyone having
 * to remember to press it.
 */
export async function readPayrollMonth(
  db: Db,
  args: { trainerUserId: string; year: number; month: number; asOf: Date },
): Promise<PayrollMonth> {
  const { from, to } = studioMonthRange(args.year, args.month);

  const [computed, adjustments] = await Promise.all([
    computePayrollMonth(db, args),
    db.payrollAdjustment.findMany({
      where: { trainerUserId: args.trainerUserId, periodStart: from },
      orderBy: { createdAt: "asc" },
      select: { id: true, amount: true, note: true, createdAt: true },
    }),
  ]);

  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

  return {
    trainerUserId: computed.trainerUserId,
    trainerName: computed.trainerName,
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    buckets: computed.buckets,
    sessions: computed.sessions.map((session) => ({
      sessionId: session.sessionId,
      startsAt: session.startsAt.toISOString(),
      classTypeName: session.classTypeName,
      attendees: session.attendees,
      gross: session.gross,
      unpricedCount: session.unpricedCount,
    })),
    sessionCount: computed.sessionCount,
    attendeeCount: computed.attendeeCount,
    gross: computed.gross,
    payout: computed.payout,
    adjustmentTotal,
    netPayout: computed.payout + adjustmentTotal,
    unpricedCount: computed.unpricedCount,
    giftCount: computed.giftCount,
    trialCount: computed.trialCount,
    adjustments: adjustments.map((a) => ({
      id: a.id,
      amount: a.amount,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
