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
import type { ReportsUtilizationHeatmapResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateIntoSlots,
  parseOptionalWindow,
  roundedRatio,
} from "@/lib/server/report-aggregation";

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
  // All-time pill omits both params — the heatmap then folds every SCHEDULED
  // session ever into the 7×4 grid (no time filter on the query).
  const window = parseOptionalWindow(url.searchParams);
  if (window.kind === "invalid") {
    return fail("Invalid timeframe", 400);
  }
  const dateFilter =
    window.kind === "window"
      ? { startsAt: { gte: window.from, lt: window.to } }
      : {};

  const sessions = await prisma.session.findMany({
    where: {
      ...dateFilter,
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

  // Pre-build the 7×4 cell grid so the response shape is stable — the
  // endpoint always returns all 28 cells, even empty ones.
  const cells = Array.from({ length: 7 * TIME_BUCKETS.length }, (_, i) => ({
    dayOfWeek: Math.floor(i / TIME_BUCKETS.length),
    timeBucket: TIME_BUCKETS[i % TIME_BUCKETS.length],
    booked: 0,
    capacity: 0,
    utilization: 0,
  }));

  accumulateIntoSlots(
    cells,
    sessions,
    (session) => {
      const bucket = classifyHour(session.startsAt.getUTCHours());
      if (bucket === null) return null; // out-of-hours session — dropped.
      return (
        session.startsAt.getUTCDay() * TIME_BUCKETS.length +
        TIME_BUCKETS.indexOf(bucket)
      );
    },
    (cell, session) => {
      cell.booked += session._count.bookings;
      cell.capacity += session.capacity;
    },
  );
  for (const cell of cells) {
    cell.utilization = roundedRatio(cell.booked, cell.capacity);
  }

  return ok({ success: true, cells } satisfies ReportsUtilizationHeatmapResponse);
}
