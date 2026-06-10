/**
 * Bookings detail — the Rezervacije sub-page payload.
 *
 * One endpoint, four chunks: headline tiles, period-bucketed time-series,
 * top-10 sessions by booking count, and a small waitlist count. All four
 * derive from the same `[from, to)` window so a single endpoint keeps the
 * UI's queries down and avoids cross-tile inconsistencies (e.g. a "show
 * rate" computed from one query window while the chart uses a slightly
 * different one).
 *
 * Definitions:
 *
 *  - Bookings are counted by `Booking.createdAt` inside the window — the
 *    headline / chart "ukupno rezervacija" is the count of bookings the
 *    studio took in that period, not the count of sessions booked in it.
 *  - Cancellations: `Booking.canceledAt != null`. The cancel "type" splits
 *    by `lateCancelHours` (from the booking's `ClientPackage`; falls back
 *    to 0 — meaning "no late window", so the cancel is always pre-cutoff
 *    — for comp/manual bookings without a package).
 *  - Late cancel: `canceledAt >= session.startsAt - lateCancelHours*1h` and
 *    `canceledAt < session.startsAt`. This mirrors `shouldApplyLateCancelPenalty`
 *    in `lib/server/cancellation-policy.ts` 1:1 so the report and the
 *    runtime penalty share the same rule.
 *  - Show rate: of bookings whose `session.startsAt < now`, the fraction
 *    that were NOT canceled (`canceledAt IS NULL`). Future bookings are
 *    excluded — they haven't been "shown" or "no-shown" yet. When no past
 *    bookings exist in the window we report 0 (the UI shows 0% but the
 *    paragraph in the tile reads "—" anyway).
 *  - Waitlist count: WaitlistEntry rows for sessions whose `startsAt` is
 *    in `[from, to)`. We don't filter by "still upcoming" — backfilling
 *    a historical window with the entries that *were* on the waitlist at
 *    that time is the more useful number.
 *
 * Top sessions: top 10 sessions in the window by **non-canceled** booking
 * count. Ties are broken by capacity (so a fuller-of-two sessions wins).
 */
import type { ReportsBookingsDetailResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateIntoBucketSeries,
  resolveBucketedWindow,
  roundedRatio,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";

const HOUR_MS = 60 * 60 * 1000;
const TOP_SESSIONS_LIMIT = 10;

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  // All-time: span yearly buckets from the earliest booking forward.
  const window = await resolveBucketedWindow(url.searchParams, async () => {
    const first = await prisma.booking.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return first?.createdAt ?? null;
  });
  if (!window) {
    return fail("Invalid timeframe", 400);
  }
  // The domain queries scope to the resolved window bounds — NOT the
  // bucket-aligned queryRange — so headline counts only cover [from, to)
  // even when the first chart bucket floors earlier.
  const { from, to } = window;
  const currentInstant = now();

  // Bookings created in the window — drives headline, chart, and cancel
  // breakdown. We pull the bits we need from Session for show-rate / late-
  // cancel classification (startsAt) and the per-booking lateCancelHours
  // snapshot off the clientPackage.
  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: from, lt: to },
    },
    select: {
      createdAt: true,
      canceledAt: true,
      session: { select: { startsAt: true } },
      clientPackage: { select: { lateCancelHours: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // --- Headline aggregates ---------------------------------------------
  let canceledTotal = 0;
  let canceledPreCutoff = 0;
  let canceledLate = 0;
  let pastBookings = 0;
  let pastBookingsShown = 0;
  for (const b of bookings) {
    if (b.canceledAt) {
      canceledTotal += 1;
      const lateCancelHours = b.clientPackage?.lateCancelHours ?? 0;
      const penaltyCutoff = new Date(
        b.session.startsAt.getTime() - lateCancelHours * HOUR_MS,
      );
      if (b.canceledAt >= penaltyCutoff && b.canceledAt < b.session.startsAt) {
        canceledLate += 1;
      } else {
        canceledPreCutoff += 1;
      }
    }
    if (b.session.startsAt < currentInstant) {
      pastBookings += 1;
      if (!b.canceledAt) pastBookingsShown += 1;
    }
  }
  const showRate = roundedRatio(pastBookingsShown, pastBookings);

  // --- Time-series ------------------------------------------------------
  const series = accumulateIntoBucketSeries(
    window.buckets,
    bookings,
    (b) => b.createdAt,
    (bk) => ({
      bucketStart: bk.bucketStart.toISOString(),
      bucketEnd: bk.bucketEnd.toISOString(),
      bookingCount: 0,
    }),
    (acc) => {
      acc.bookingCount += 1;
    },
  );

  // --- Top sessions -----------------------------------------------------
  // We rank sessions by *active* (non-canceled) bookings created in the
  // window. The session itself may live outside the window — e.g. a booking
  // taken today for a session a week out — but the bookings that count
  // toward "top" are still scoped to the period.
  const grouped = await prisma.booking.groupBy({
    by: ["sessionId"],
    where: {
      createdAt: { gte: from, lt: to },
      canceledAt: null,
    },
    _count: { _all: true },
    orderBy: { _count: { sessionId: "desc" } },
    take: TOP_SESSIONS_LIMIT,
  });
  const topSessionIds = grouped.map((g) => g.sessionId);
  const sessionRows =
    topSessionIds.length === 0
      ? []
      : await prisma.session.findMany({
          where: { id: { in: topSessionIds } },
          select: {
            id: true,
            startsAt: true,
            capacity: true,
            classType: { select: { name: true } },
            room: { select: { name: true } },
          },
        });
  const sessionMap = new Map(sessionRows.map((s) => [s.id, s]));
  // groupBy ordering is by sessionId count desc — when counts tie, fall
  // back to capacity desc so the fuller of two equally-booked sessions
  // surfaces first.
  const topSessions = sortedByMetricDesc(
    grouped
      .map((g) => {
        const session = sessionMap.get(g.sessionId);
        if (!session) return null;
        return {
          sessionId: session.id,
          startsAt: session.startsAt.toISOString(),
          classTypeName: session.classType.name,
          roomName: session.room?.name ?? null,
          bookedCount: g._count._all,
          capacity: session.capacity,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (row) => row.bookedCount,
    (a, b) => b.capacity - a.capacity,
  );

  // --- Waitlist ---------------------------------------------------------
  // WaitlistEntry has no "promoted" flag — promotion deletes the row — so
  // a row's existence already means "still on the waitlist". Scope by the
  // session's `startsAt` falling in the period so the number reads
  // intuitively for historical windows.
  const waitlistCount = await prisma.waitlistEntry.count({
    where: {
      session: { startsAt: { gte: from, lt: to } },
    },
  });

  return ok({
    success: true,
    headline: {
      totalBookings: bookings.length,
      showRate,
      canceledTotal,
      canceledPreCutoff,
      canceledLate,
      waitlistCount,
    },
    timeSeries: series,
    topSessions,
  } satisfies ReportsBookingsDetailResponse);
}
