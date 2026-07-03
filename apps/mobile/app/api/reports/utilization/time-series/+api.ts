/**
 * Utilization time-series for the Iskorišćenost sub-page trend line.
 *
 * One bucket per point. Bucket granularity is driven by the `period` query
 * param coming off the UI period pill — `week` and `month` get daily
 * buckets, `quarter` gets weekly, `year` gets monthly. `all` (the "Sve
 * vreme" option) switches to yearly buckets anchored at the earliest
 * SCHEDULED session. Mirrors the Prihod time-series bucketing 1:1 — they
 * share `resolveBucketedWindow`.
 *
 * Sessions are bucketed by `startsAt`. Only `SCHEDULED` sessions count —
 * canceled-status sessions are dropped (they don't represent real
 * capacity). Empty buckets are emitted so the chart layout stays stable.
 */
import type { ReportsUtilizationTimeSeriesResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateIntoBucketSeries,
  resolveBucketedWindow,
  roundedRatio,
} from "@/lib/server/report-aggregation";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const window = await resolveBucketedWindow(url.searchParams, async () => {
    const first = await prisma.session.findFirst({
      where: { status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    return first?.startsAt ?? null;
  });
  if (!window) {
    return fail("Invalid timeframe", 400);
  }

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: window.queryRange,
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
    orderBy: { startsAt: "asc" },
  });

  const rows = accumulateIntoBucketSeries(
    window.buckets,
    sessions,
    (session) => session.startsAt,
    (b) => ({
      bucketStart: b.bucketStart.toISOString(),
      bucketEnd: b.bucketEnd.toISOString(),
      booked: 0,
      capacity: 0,
      utilization: 0,
    }),
    (acc, session) => {
      acc.booked += session._count.bookings;
      acc.capacity += session.capacity;
    },
  );

  // Compute utilization per row after totals are summed.
  for (const row of rows) {
    row.utilization = roundedRatio(row.booked, row.capacity);
  }

  return ok({ success: true, buckets: rows } satisfies ReportsUtilizationTimeSeriesResponse);
}
