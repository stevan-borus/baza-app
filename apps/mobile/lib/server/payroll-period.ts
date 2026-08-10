import type { Prisma, PrismaClient } from "@/generated/prisma";
import { studioMonthRange } from "@/lib/payroll-valuation";
import type { PayrollMonth as PayrollMonthCompute } from "@/lib/server/payroll";
import type { PayrollMonth } from "@baza/types/payroll";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Read one trainer's month as the API shape.
 *
 * An OPEN period is recomputed live, so it tracks late bookings and
 * corrections. A LOCKED period is served entirely from its snapshotted lines:
 * the whole point of locking is that editing a package price or revoking a
 * package afterwards can never rewrite a month that has already been paid.
 */
export async function readPayrollPeriod(
  db: Db,
  args: {
    trainerUserId: string;
    year: number;
    month: number;
    asOf: Date;
    compute: (
      db: Db,
      a: { trainerUserId: string; year: number; month: number; asOf: Date },
    ) => Promise<PayrollMonthCompute>;
  },
): Promise<PayrollMonth> {
  const { from, to } = studioMonthRange(args.year, args.month);

  const period = await db.payrollPeriod.findUnique({
    where: {
      trainerUserId_periodStart: {
        trainerUserId: args.trainerUserId,
        periodStart: from,
      },
    },
    select: {
      status: true,
      percent: true,
      grossAmount: true,
      payoutAmount: true,
      lockedAt: true,
      lines: {
        orderBy: { sessionStartsAt: "asc" },
        select: {
          sessionId: true,
          sessionStartsAt: true,
          classTypeName: true,
          clientName: true,
          packageName: true,
          sessionValue: true,
          isGift: true,
        },
      },
      adjustments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, note: true, createdAt: true },
      },
    },
  });

  const adjustments = (period?.adjustments ?? []).map((a) => ({
    id: a.id,
    amount: a.amount,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  }));
  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

  if (period?.status === "LOCKED") {
    // Rebuild the per-session grouping from the frozen lines so a locked month
    // renders identically to an open one.
    const bySession = new Map<
      string,
      {
        sessionId: string;
        startsAt: Date;
        classTypeName: string;
        attendees: PayrollMonth["sessions"][number]["attendees"];
        gross: number;
      }
    >();
    for (const line of period.lines) {
      const key = line.sessionId ?? `${line.sessionStartsAt.toISOString()}:${line.classTypeName}`;
      const existing = bySession.get(key);
      const attendee = {
        bookingId: `${key}:${line.clientName}`,
        clientName: line.clientName,
        packageName: line.packageName,
        sessionValue: line.sessionValue,
        isGift: line.isGift,
      };
      if (existing) {
        existing.attendees.push(attendee);
        existing.gross += line.sessionValue;
      } else {
        bySession.set(key, {
          sessionId: line.sessionId ?? key,
          startsAt: line.sessionStartsAt,
          classTypeName: line.classTypeName,
          attendees: [attendee],
          gross: line.sessionValue,
        });
      }
    }
    const sessions = [...bySession.values()].map((s) => ({
      sessionId: s.sessionId,
      startsAt: s.startsAt.toISOString(),
      classTypeName: s.classTypeName,
      attendees: s.attendees,
      gross: s.gross,
      unpricedCount: 0,
    }));
    const payout = period.payoutAmount ?? 0;

    const trainer = await db.user.findUnique({
      where: { id: args.trainerUserId },
      select: { firstName: true, lastName: true },
    });

    return {
      trainerUserId: args.trainerUserId,
      trainerName: trainer ? `${trainer.firstName} ${trainer.lastName}`.trim() : "—",
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      percent: period.percent,
      status: "LOCKED",
      lockedAt: period.lockedAt?.toISOString() ?? null,
      sessions,
      sessionCount: sessions.length,
      attendeeCount: period.lines.length,
      gross: period.grossAmount ?? 0,
      payout,
      adjustmentTotal,
      netPayout: payout + adjustmentTotal,
      unpricedCount: 0,
      giftCount: period.lines.filter((l) => l.isGift).length,
      adjustments,
    };
  }

  const computed = await args.compute(db, {
    trainerUserId: args.trainerUserId,
    year: args.year,
    month: args.month,
    asOf: args.asOf,
  });

  return {
    trainerUserId: computed.trainerUserId,
    trainerName: computed.trainerName,
    periodStart: computed.periodStart.toISOString(),
    periodEnd: computed.periodEnd.toISOString(),
    percent: computed.percent,
    status: "OPEN",
    lockedAt: null,
    sessions: computed.sessions.map((s) => ({
      sessionId: s.sessionId,
      startsAt: s.startsAt.toISOString(),
      classTypeName: s.classTypeName,
      attendees: s.attendees,
      gross: Math.round(s.gross),
      unpricedCount: s.unpricedCount,
    })),
    sessionCount: computed.sessionCount,
    attendeeCount: computed.attendeeCount,
    gross: computed.gross,
    payout: computed.payout,
    adjustmentTotal,
    netPayout: computed.payout + adjustmentTotal,
    unpricedCount: computed.unpricedCount,
    giftCount: computed.giftCount,
    adjustments,
  };
}
