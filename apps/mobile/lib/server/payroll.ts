import type { Prisma, PrismaClient } from "@/generated/prisma";
import { packageSessionsTotal } from "@/lib/package-total";
import { formatFullName } from "@baza/types/common";
import {
  studioMonthRange,
  valueSession,
  type PayrollAttendee,
} from "@/lib/payroll-valuation";

/**
 * Trainer payroll, the data half: which bookings count as attendance, and how
 * a month's sessions roll up into one payout. The money rule itself lives in
 * `lib/payroll-valuation.ts`.
 */

export type PayrollSessionBreakdown = {
  sessionId: string;
  startsAt: Date;
  classTypeName: string;
  attendees: Array<{
    bookingId: string;
    clientName: string;
    packageName: string;
    sessionValue: number | null;
    isGift: boolean;
  }>;
  gross: number;
  unpricedCount: number;
};

export type PayrollMonth = {
  trainerUserId: string;
  trainerName: string;
  periodStart: Date;
  periodEnd: Date;
  percent: number | null;
  sessions: PayrollSessionBreakdown[];
  sessionCount: number;
  attendeeCount: number;
  gross: number;
  payout: number;
  /** Attendances whose package carries no price — shown, never hidden. */
  unpricedCount: number;
  giftCount: number;
};

/**
 * The rate in force at `at`: the newest rate starting at or before it. Returns
 * null when the trainer has no rate configured, which the caller surfaces
 * rather than defaulting to some invented percentage.
 */
export async function effectiveTrainerPercent(
  db: PrismaClient | Prisma.TransactionClient,
  trainerUserId: string,
  at: Date,
): Promise<number | null> {
  const rate = await db.trainerRate.findFirst({
    where: { trainerUserId, effectiveFrom: { lte: at } },
    // seq breaks the tie between rates sharing an effectiveFrom: every rate
    // set on the same day starts at the same studio-day boundary, so without
    // it a same-day correction loses to the row it was meant to replace and
    // the payout uses an arbitrary percentage. createdAt is NOT enough —
    // Postgres now() is transaction time, so rows written together tie there
    // too.
    orderBy: [{ effectiveFrom: "desc" }, { seq: "desc" }],
    select: { percent: true },
  });
  return rate?.percent ?? null;
}

/**
 * Compute one trainer's month from live booking data.
 *
 * Attendance = a booking that was never canceled, on a session that already
 * ended and was not canceled. Charged no-shows are deliberately included: if
 * the client did not cancel in time the session came out of their package, so
 * the trainer is paid for it (owner's rule).
 */
export async function computePayrollMonth(
  db: PrismaClient | Prisma.TransactionClient,
  args: { trainerUserId: string; year: number; month: number; asOf: Date },
): Promise<PayrollMonth> {
  const { from, to } = studioMonthRange(args.year, args.month);

  const trainer = await db.user.findUnique({
    where: { id: args.trainerUserId },
    select: { firstName: true, lastName: true },
  });

  const sessions = await db.session.findMany({
    where: {
      trainerUserId: args.trainerUserId,
      startsAt: { gte: from, lt: to },
      status: { not: "CANCELED" },
      // Only sessions that have actually happened can be paid for.
      endsAt: { lte: args.asOf },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      classType: { select: { name: true } },
      bookings: {
        where: { canceledAt: null },
        select: {
          id: true,
          clientProfileId: true,
          clientProfile: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
          clientPackage: {
            select: {
              isGift: true,
              sessionsGranted: true,
              bonusSessions: true,
              packageType: { select: { name: true, price: true } },
            },
          },
        },
      },
    },
  });

  const breakdowns: PayrollSessionBreakdown[] = sessions.map((session) => {
    const attendees: PayrollAttendee[] = session.bookings.map((booking) => {
      const pkg = booking.clientPackage;
      return {
        bookingId: booking.id,
        clientProfileId: booking.clientProfileId,
        clientName: formatFullName(
          booking.clientProfile.user.firstName,
          booking.clientProfile.user.lastName,
        ),
        // A booking with no package at all (an unbacked attendance) is still
        // shown, valued at nothing, and counted as unpriced.
        packageName: pkg?.packageType.name ?? "—",
        packagePrice: pkg?.packageType.price ?? null,
        sessionsTotal: pkg ? packageSessionsTotal(pkg) : 0,
        isGift: pkg?.isGift ?? false,
      };
    });

    const valued = valueSession(attendees);
    return {
      sessionId: session.id,
      startsAt: session.startsAt,
      classTypeName: session.classType.name,
      attendees: valued.lines.map((line) => ({
        bookingId: line.bookingId,
        clientName: line.clientName,
        packageName: line.packageName,
        sessionValue: line.sessionValue === null ? null : Math.round(line.sessionValue),
        isGift: line.isGift,
      })),
      gross: valued.gross,
      unpricedCount: valued.unpricedCount,
    };
  });

  const percent = await effectiveTrainerPercent(db, args.trainerUserId, from);
  const gross = breakdowns.reduce((sum, s) => sum + s.gross, 0);

  return {
    trainerUserId: args.trainerUserId,
    trainerName: trainer
      ? formatFullName(trainer.firstName, trainer.lastName)
      : "—",
    periodStart: from,
    periodEnd: to,
    percent,
    sessions: breakdowns,
    sessionCount: breakdowns.length,
    attendeeCount: breakdowns.reduce((sum, s) => sum + s.attendees.length, 0),
    gross: Math.round(gross),
    payout: percent === null ? 0 : Math.round((gross * percent) / 100),
    unpricedCount: breakdowns.reduce((sum, s) => sum + s.unpricedCount, 0),
    giftCount: breakdowns.reduce(
      (sum, s) => sum + s.attendees.filter((a) => a.isGift).length,
      0,
    ),
  };
}
