/**
 * Utilization time-series for the Iskorišćenost sub-page trend line.
 *
 * One bucket per point. Bucket granularity is driven by the `period` query
 * param coming off the UI period pill — `week` and `month` get daily
 * buckets, `quarter` gets weekly, `year` gets monthly. Mirrors the
 * Prihod time-series bucketing 1:1 — they share `buildPeriodBuckets`.
 *
 * Sessions are bucketed by `startsAt`. Only `SCHEDULED` sessions count —
 * canceled-status sessions are dropped (they don't represent real
 * capacity). Empty buckets are emitted so the chart layout stays stable.
 */
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  buildPeriodBuckets,
  bucketSizeForPeriod,
  parseDateInput,
} from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  if (!from || !to || from >= to) {
    return fail("Invalid timeframe", 400);
  }
  const size = bucketSizeForPeriod(url.searchParams.get("period"));

  const buckets = buildPeriodBuckets(from, to, size);

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: {
        gte: buckets[0]?.bucketStart ?? from,
        lt: buckets[buckets.length - 1]?.bucketEnd ?? to,
      },
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

  const rows = buckets.map((b) => ({
    bucketStart: b.bucketStart.toISOString(),
    bucketEnd: b.bucketEnd.toISOString(),
    booked: 0,
    capacity: 0,
    utilization: 0,
  }));
  let bucketIdx = 0;
  for (const session of sessions) {
    const t = session.startsAt.getTime();
    while (
      bucketIdx < buckets.length &&
      t >= buckets[bucketIdx].bucketEnd.getTime()
    ) {
      bucketIdx += 1;
    }
    if (bucketIdx >= buckets.length) break;
    if (t < buckets[bucketIdx].bucketStart.getTime()) continue;
    rows[bucketIdx].booked += session._count.bookings;
    rows[bucketIdx].capacity += session.capacity;
  }

  // Compute utilization per row after totals are summed.
  for (const row of rows) {
    row.utilization =
      row.capacity > 0 ? Number((row.booked / row.capacity).toFixed(4)) : 0;
  }

  return ok({ success: true, buckets: rows });
}
