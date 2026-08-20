import type { Prisma, PrismaClient } from "@/generated/prisma";
import { packageSessionsTotal } from "@/lib/package-total";
import { formatFullName } from "@baza/types/common";
import {
  bucketPayout,
  studioMonthRange,
  valueSession,
  type PayrollAttendee,
  type PayrollBucket,
} from "@/lib/payroll-valuation";
import {
  effectiveTrainerPercentFor,
  hasLiveOverride,
} from "@/lib/trainer-rate-selection";

/**
 * Trainer payroll, the data half: which bookings count as attendance, and how
 * a month's sessions roll up into one payout. The money rule itself lives in
 * `lib/payroll-valuation.ts`.
 */

export type PayrollSessionBreakdown = {
  sessionId: string;
  startsAt: Date;
  classTypeId: string;
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
  /** The payout split by rate — one row per override, plus the default. */
  buckets: PayrollBucket[];
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
 * Every rate of the trainer's that had taken effect by `at`, across all scopes
 * — the default one and each per-class-type override.
 *
 * One query rather than one per class type: a month touches a handful of class
 * types, and the resolution rule (override, tombstone, default) is a pure
 * function that only needs the rows.
 */
async function trainerRatesAsOf(
  db: PrismaClient | Prisma.TransactionClient,
  trainerUserId: string,
  at: Date,
) {
  const rates = await db.trainerRate.findMany({
    where: { trainerUserId, effectiveFrom: { lte: at } },
    select: {
      id: true,
      trainerUserId: true,
      classTypeId: true,
      percent: true,
      effectiveFrom: true,
      note: true,
      createdAt: true,
      // seq breaks the tie between rates sharing an effectiveFrom: every rate
      // set on the same day starts at the same studio-day boundary, so without
      // it a same-day correction loses to the row it was meant to replace and
      // the payout uses an arbitrary percentage. createdAt is NOT enough —
      // Postgres now() is transaction time, so rows written together tie there
      // too.
      seq: true,
    },
  });
  return rates.map((rate) => ({
    ...rate,
    // percent is Decimal(5,2) in the DB — rates carry half points. Everything
    // downstream (selection, bucketing, the wire) works in plain numbers, so
    // the Decimal stops here rather than leaking into arithmetic that would
    // silently concatenate it or into JSON as an object.
    percent: rate.percent === null ? null : Number(rate.percent),
    effectiveFrom: rate.effectiveFrom.toISOString(),
    createdAt: rate.createdAt.toISOString(),
  }));
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
    // Newest first: reviewing a month means starting from the most recent
    // training, not scrolling past four weeks to reach it.
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      classTypeId: true,
      classType: { select: { name: true } },
      // The frozen payroll record. Present for every consumed attendance,
      // which is everything the daily cron has caught up with.
      consumptions: {
        select: {
          id: true,
          // Needed to tell which bookings this session has already frozen, so
          // an un-snapshotted one can be shown without double-counting.
          clientProfileId: true,
          clientName: true,
          packageName: true,
          sessionValue: true,
          isGift: true,
        },
      },
      // Fallback only: a session that ended but has not been consumed yet
      // (the cron runs daily) still has to show something, so it is valued
      // live until the snapshot lands.
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
              packageType: {
                select: { name: true, price: true, sessionCount: true },
              },
            },
          },
        },
      },
    },
  });

  const breakdowns: PayrollSessionBreakdown[] = sessions.map((session) => {
    // Snapshots win outright. Mixing them with live bookings would let a
    // deleted client's frozen line be "corrected" by the absence of its
    // booking, which is exactly what the snapshot exists to prevent.
    //
    // But a session can be PART-snapshotted: when a booking has no eligible
    // package the cron writes no consumption row for it, while its
    // session-mates are frozen normally. Choosing snapshots OR bookings
    // dropped that attendee from the report — the one signal telling the
    // studio somebody trained without a package. So: every snapshot, plus any
    // booking that has none, matched on the client.
    // A snapshot outlives its client (the FK nulls on delete), and a deleted
    // client has no live booking to double-count anyway, so nulls are simply
    // not worth matching on.
    const snapshotted = new Set(
      session.consumptions
        .map((c) => c.clientProfileId)
        .filter((id): id is string => id !== null),
    );
    const frozen: PayrollAttendee[] = session.consumptions.map((c) => ({
      bookingId: c.id,
      clientProfileId: c.clientProfileId ?? "",
      clientName: c.clientName,
      packageName: c.packageName ?? "—",
      // Already divided at consumption time; feed it through as a
      // single-session package so the shared valuation stays one rule.
      packagePrice: c.sessionValue,
      sessionsTotal: c.sessionValue === null ? 0 : 1,
      isGift: c.isGift,
    }));
    const live: PayrollAttendee[] = session.bookings
      .filter((booking) => !snapshotted.has(booking.clientProfileId))
      .map((booking) => {
          const pkg = booking.clientPackage;
          return {
            bookingId: booking.id,
            clientProfileId: booking.clientProfileId,
            clientName: formatFullName(
              booking.clientProfile.user.firstName,
              booking.clientProfile.user.lastName,
            ),
            // A booking with no package at all (an unbacked attendance) is
            // still shown, valued at nothing, and counted as unpriced.
            packageName: pkg?.packageType.name ?? "—",
            packagePrice: pkg?.packageType.price ?? null,
            // Same rule as the snapshot: a gift is worth one session of the
            // real package, so the price spreads over the SKU's own count.
            sessionsTotal: pkg
              ? pkg.isGift
                ? pkg.packageType.sessionCount
                : packageSessionsTotal(pkg)
              : 0,
            isGift: pkg?.isGift ?? false,
          };
        });

    const valued = valueSession([...frozen, ...live]);
    return {
      sessionId: session.id,
      startsAt: session.startsAt,
      classTypeId: session.classTypeId,
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

  // Rates are read ONCE, at the month's start: a percentage agreed on the 15th
  // starts on the 15th, and a month already settled at the old one must not
  // move. Same rule the single default rate has always followed.
  const rates = await trainerRatesAsOf(db, args.trainerUserId, from);
  const { buckets, gross, payout } = bucketPayout(breakdowns, (classTypeId) => ({
    percent: effectiveTrainerPercentFor(rates, args.trainerUserId, classTypeId, from),
    // A class type earns its own bucket when a LIVE scoped rate covers it; a
    // tombstoned one has been handed back to the default and belongs there.
    overridden: hasLiveOverride(rates, args.trainerUserId, classTypeId, from),
  }));

  return {
    trainerUserId: args.trainerUserId,
    trainerName: trainer
      ? formatFullName(trainer.firstName, trainer.lastName)
      : "—",
    periodStart: from,
    periodEnd: to,
    buckets,
    sessions: breakdowns,
    sessionCount: breakdowns.length,
    attendeeCount: breakdowns.reduce((sum, s) => sum + s.attendees.length, 0),
    gross,
    payout,
    unpricedCount: breakdowns.reduce((sum, s) => sum + s.unpricedCount, 0),
    giftCount: breakdowns.reduce(
      (sum, s) => sum + s.attendees.filter((a) => a.isGift).length,
      0,
    ),
  };
}
