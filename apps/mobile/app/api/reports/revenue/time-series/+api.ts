/**
 * Revenue time-series for the Prihod sub-page bar chart.
 *
 * One bucket per bar. Bucket granularity is driven by the `period` query param
 * coming off the UI period pill — `week` and `month` get daily buckets,
 * `quarter` gets weekly, `year` gets monthly. `from`/`to` bound the window;
 * empty buckets are emitted so the chart layout stays stable across periods.
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
