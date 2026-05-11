/**
 * Utilization heatmap — 7 days × 4 time-of-day buckets = 28 cells.
 *
 * For every Session in [from, to) we classify it by day-of-week and a
 * coarse time-of-day bucket (morning 06–11, midday 11–15, afternoon
 * 15–19, evening 19–22). Sessions outside 06:00–22:00 are dropped from
 * this view — they're noise on the heatmap and the studio doesn't
 * meaningfully operate outside those hours anyway.
 *
 * Day-of-week origin: JS `Date#getUTCDay()` returns 0=Sunday..6=Saturday.
 * We keep that — UI labels for `dayOfWeek=1` map to "Mon" in the locale.
 * (ISO order with Monday first is purely a render-time concern.)
 *
 * The endpoint always returns all 28 cells, even empty ones, so the UI
 * grid layout is stable across periods.
 */
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { parseDateInput } from "@/lib/server/reports";

type TimeBucket = "morning" | "midday" | "afternoon" | "evening";

const TIME_BUCKETS: ReadonlyArray<TimeBucket> = [
  "morning",
  "midday",
  "afternoon",
  "evening",
];

function classifyHour(hour: number): TimeBucket | null {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 19) return "afternoon";
  if (hour >= 19 && hour < 22) return "evening";
  return null;
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  if (!from || !to || from >= to) {
    return fail("Invalid timeframe", 400);
  }

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      status: "SCHEDULED",
    },
    select: {
      startsAt: true,
      capacity: true,
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
        },
      },
    },
  });

  // Pre-build the 7×4 cell grid so the response shape is stable.
  type CellAgg = { booked: number; capacity: number };
  const cells: CellAgg[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 4 }, () => ({ booked: 0, capacity: 0 })),
  );

  for (const session of sessions) {
    const dow = session.startsAt.getUTCDay(); // 0..6
    const hour = session.startsAt.getUTCHours();
    const bucket = classifyHour(hour);
    if (bucket === null) continue; // out-of-hours session — dropped.
    const bucketIdx = TIME_BUCKETS.indexOf(bucket);
    cells[dow][bucketIdx].booked += session._count.bookings;
    cells[dow][bucketIdx].capacity += session.capacity;
  }

  const out: Array<{
    dayOfWeek: number;
    timeBucket: TimeBucket;
    booked: number;
    capacity: number;
    utilization: number;
  }> = [];
  for (let dow = 0; dow < 7; dow += 1) {
    for (let b = 0; b < TIME_BUCKETS.length; b += 1) {
      const c = cells[dow][b];
      out.push({
        dayOfWeek: dow,
        timeBucket: TIME_BUCKETS[b],
        booked: c.booked,
        capacity: c.capacity,
        utilization:
          c.capacity > 0 ? Number((c.booked / c.capacity).toFixed(4)) : 0,
      });
    }
  }

  return ok({ success: true, cells: out });
}
