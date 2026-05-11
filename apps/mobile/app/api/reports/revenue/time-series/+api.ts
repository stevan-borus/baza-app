/**
 * Revenue time-series for the Prihod sub-page bar chart.
 *
 * One bucket per bar. Bucket granularity is driven by the `period` query param
 * coming off the UI period pill — `week` and `month` get daily buckets,
 * `quarter` gets weekly, `year` gets monthly. `all` (the "Sve vreme" option)
 * switches to yearly buckets and spans from the earliest CONFIRMED payment
 * to today, so the chart scales as the studio ages instead of dumping
 * hundreds of daily bars. `from`/`to` bound the window; empty buckets are
 * emitted so the chart layout stays stable across periods.
 *
 * Only CONFIRMED BillingRecords contribute — pending and canceled rows would
 * inflate the bar heights misleadingly. Aggregation is in-process: pulling
 * the (clipped, indexed by createdAt) row range and summing into pre-built
 * bucket slots avoids Prisma's lack of a portable date_trunc.
 */
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  buildRevenueBuckets,
  bucketSizeForPeriod,
  parseDateInput,
  resolveAllTimeWindow,
} from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const rawFrom = parseDateInput(url.searchParams.get("from"));
  const rawTo = parseDateInput(url.searchParams.get("to"));
  // For "all time" we anchor the lower bound to the earliest CONFIRMED
  // payment so the chart's leftmost bar lines up with the studio's first
  // sale, not the Unix epoch.
  const earliest = rawFrom || rawTo
    ? null
    : (
        await prisma.billingRecord.findFirst({
          where: { status: "CONFIRMED" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      )?.createdAt ?? null;
  const window = resolveAllTimeWindow(rawFrom, rawTo, earliest);
  if (!window) {
    return fail("Invalid timeframe", 400);
  }
  const { from, to, isAllTime } = window;
  const size = bucketSizeForPeriod(
    isAllTime ? "all" : url.searchParams.get("period"),
  );

  const buckets = buildRevenueBuckets(from, to, size);

  const payments = await prisma.billingRecord.findMany({
    where: {
      status: "CONFIRMED",
      createdAt: {
        gte: buckets[0]?.bucketStart ?? from,
        lt: buckets[buckets.length - 1]?.bucketEnd ?? to,
      },
    },
    select: { createdAt: true, amount: true },
    orderBy: { createdAt: "asc" },
  });

  // Each bucket gets aggregated counters. Walk payments + buckets together —
  // both are time-sorted, so we can pop forward through buckets as we go.
  const rows = buckets.map((b) => ({
    bucketStart: b.bucketStart.toISOString(),
    bucketEnd: b.bucketEnd.toISOString(),
    revenue: 0,
    paymentCount: 0,
  }));
  let bucketIdx = 0;
  for (const payment of payments) {
    const t = payment.createdAt.getTime();
    while (
      bucketIdx < buckets.length &&
      t >= buckets[bucketIdx].bucketEnd.getTime()
    ) {
      bucketIdx += 1;
    }
    if (bucketIdx >= buckets.length) break;
    if (t < buckets[bucketIdx].bucketStart.getTime()) continue;
    rows[bucketIdx].revenue += payment.amount;
    rows[bucketIdx].paymentCount += 1;
  }

  return ok({ success: true, buckets: rows });
}
