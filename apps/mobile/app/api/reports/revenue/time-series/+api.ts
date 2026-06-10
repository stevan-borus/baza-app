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
import type { ReportsRevenueTimeSeriesResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateIntoBucketSeries,
  resolveBucketedWindow,
} from "@/lib/server/report-aggregation";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  // For "all time" we anchor the lower bound to the earliest CONFIRMED
  // payment so the chart's leftmost bar lines up with the studio's first
  // sale, not the Unix epoch.
  const window = await resolveBucketedWindow(url.searchParams, async () => {
    const first = await prisma.billingRecord.findFirst({
      where: { status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return first?.createdAt ?? null;
  });
  if (!window) {
    return fail("Invalid timeframe", 400);
  }

  const payments = await prisma.billingRecord.findMany({
    where: {
      status: "CONFIRMED",
      createdAt: window.queryRange,
    },
    select: { createdAt: true, amount: true },
    orderBy: { createdAt: "asc" },
  });

  const rows = accumulateIntoBucketSeries(
    window.buckets,
    payments,
    (payment) => payment.createdAt,
    (b) => ({
      bucketStart: b.bucketStart.toISOString(),
      bucketEnd: b.bucketEnd.toISOString(),
      revenue: 0,
      paymentCount: 0,
    }),
    (acc, payment) => {
      acc.revenue += payment.amount;
      acc.paymentCount += 1;
    },
  );

  return ok({ success: true, buckets: rows } satisfies ReportsRevenueTimeSeriesResponse);
}
