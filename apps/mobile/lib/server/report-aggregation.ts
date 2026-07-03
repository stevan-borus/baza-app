/**
 * Shared aggregation mechanics behind the /api/reports/* endpoints.
 *
 * Every report endpoint owns its *domain* query (which table, which
 * where-clause — revenue scopes `createdAt` + `status: CONFIRMED`,
 * utilization scopes `startsAt` + `status: SCHEDULED`) and delegates the
 * *mechanics* here: timeframe window resolution, period bucketing, and
 * group-by-key accumulation.
 */
import type { ReportsPeriod } from "@baza/types/reports";
import {
  bucketSizeForPeriod,
  buildPeriodBuckets,
  getReportBucketLabel,
  parseDateInput,
  resolveAllTimeWindow,
} from "@/lib/server/reports";

export type PeriodBucket = { bucketStart: Date; bucketEnd: Date };

export type OptionalWindow =
  | { kind: "window"; from: Date; to: Date }
  | { kind: "all-time" }
  | { kind: "invalid" };

/**
 * The breakdown endpoints' shared `from`/`to` contract: both bounds present
 * and ordered → a concrete window; both absent (the "Sve vreme" pill) →
 * all-time, i.e. drop the date filter entirely; anything one-sided or
 * inverted is a client bug → invalid (callers 400). Unparseable dates behave
 * like absent ones, matching `parseDateInput`.
 */
export function parseOptionalWindow(
  searchParams: URLSearchParams,
): OptionalWindow {
  const from = parseDateInput(searchParams.get("from"));
  const to = parseDateInput(searchParams.get("to"));
  if (from && to && from < to) return { kind: "window", from, to };
  if (!from && !to) return { kind: "all-time" };
  return { kind: "invalid" };
}

/**
 * The time-series endpoints' shared window contract: resolve `from`/`to` (+
 * the UI period pill) into the zero-fill bucket list and the Prisma
 * `gte`/`lt` range that covers it. For the all-time pill (both bounds
 * absent) the lower bound is anchored at `fetchEarliest()` — typically the
 * table's earliest relevant row — with yearly buckets so the chart scales as
 * the studio ages. `fetchEarliest` is only awaited in that all-time case.
 * Returns null for a one-sided / inverted window (callers 400).
 *
 * `from`/`to` are the resolved window bounds; `queryRange` is the
 * bucket-aligned superset (first bucket floors below `from`) for callers
 * whose rows must cover every emitted bucket.
 */
export async function resolveBucketedWindow(
  searchParams: URLSearchParams,
  fetchEarliest: () => Promise<Date | null>,
): Promise<{
  from: Date;
  to: Date;
  buckets: PeriodBucket[];
  queryRange: { gte: Date; lt: Date };
} | null> {
  const rawFrom = parseDateInput(searchParams.get("from"));
  const rawTo = parseDateInput(searchParams.get("to"));
  const earliest = rawFrom || rawTo ? null : await fetchEarliest();
  const window = resolveAllTimeWindow(rawFrom, rawTo, earliest);
  if (!window) return null;
  const { from, to, isAllTime } = window;
  const size = bucketSizeForPeriod(
    isAllTime ? "all" : searchParams.get("period"),
  );
  const buckets = buildPeriodBuckets(from, to, size);
  return {
    from,
    to,
    buckets,
    queryRange: {
      gte: buckets[0]?.bucketStart ?? from,
      lt: buckets[buckets.length - 1]?.bucketEnd ?? to,
    },
  };
}

/**
 * Bucket rows into period-labeled groups (via `getReportBucketLabel`) and
 * emit one accumulator per label in first-seen order. Callers pass rows
 * pre-sorted by date, so first-seen order is chronological.
 */
export function accumulatePeriodSeries<Row, Acc>(
  rows: readonly Row[],
  period: ReportsPeriod,
  dateOf: (row: Row) => Date,
  init: (label: string) => Acc,
  accumulate: (acc: Acc, row: Row) => void,
): Acc[] {
  const byLabel = new Map<string, Acc>();
  for (const row of rows) {
    const label = getReportBucketLabel(dateOf(row), period);
    let acc = byLabel.get(label);
    if (acc === undefined) {
      acc = init(label);
      byLabel.set(label, acc);
    }
    accumulate(acc, row);
  }
  return [...byLabel.values()];
}

/**
 * Group rows by an arbitrary key (roomId, trainerUserId, packageTypeId, …)
 * and emit one accumulator per key in first-seen order. The accumulator is
 * seeded from the first row of its group (`init`), so identity fields (name,
 * id) can be carried over while the numeric fields start at zero. Rows whose
 * key resolves to `null` are dropped — e.g. sessions without a room.
 */
export function accumulateByKey<Row, Acc>(
  rows: readonly Row[],
  keyOf: (row: Row) => string | null,
  init: (row: Row) => Acc,
  accumulate: (acc: Acc, row: Row) => void,
): Acc[] {
  const byKey = new Map<string, Acc>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    let acc = byKey.get(key);
    if (acc === undefined) {
      acc = init(row);
      byKey.set(key, acc);
    }
    accumulate(acc, row);
  }
  return [...byKey.values()];
}

/**
 * Accumulate rows into a pre-built, zero-filled bucket series (the
 * time-series endpoints' "emit every bucket, even empty ones" contract —
 * chart layouts depend on it). One slot per bucket, in bucket order; rows
 * before the first bucket or at/after the last bucket's end are dropped.
 *
 * Rows must be sorted ascending by `dateOf` — both are time-sorted, so a
 * single forward walk pairs them up.
 */
export function accumulateIntoBucketSeries<Row, Acc>(
  buckets: readonly PeriodBucket[],
  rows: readonly Row[],
  dateOf: (row: Row) => Date,
  init: (bucket: PeriodBucket) => Acc,
  accumulate: (acc: Acc, row: Row) => void,
): Acc[] {
  const slots = buckets.map((bucket) => init(bucket));
  let bucketIdx = 0;
  for (const row of rows) {
    const t = dateOf(row).getTime();
    while (
      bucketIdx < buckets.length &&
      t >= buckets[bucketIdx].bucketEnd.getTime()
    ) {
      bucketIdx += 1;
    }
    if (bucketIdx >= buckets.length) break;
    if (t < buckets[bucketIdx].bucketStart.getTime()) continue;
    accumulate(slots[bucketIdx], row);
  }
  return slots;
}

/**
 * Accumulate rows into a pre-built fixed grid of slots (e.g. the heatmap's
 * 7×4 day-of-week × time-of-day cells). The slot order never changes —
 * stability of the emitted grid is part of the wire contract. Rows whose
 * index resolves to `null` are dropped (e.g. out-of-hours sessions).
 */
export function accumulateIntoSlots<Row, Acc>(
  slots: Acc[],
  rows: readonly Row[],
  slotIndexOf: (row: Row) => number | null,
  accumulate: (acc: Acc, row: Row) => void,
): Acc[] {
  for (const row of rows) {
    const idx = slotIndexOf(row);
    if (idx === null) continue;
    accumulate(slots[idx], row);
  }
  return slots;
}

/**
 * Sort rows descending by a numeric metric, returning a new array.
 * `Array.prototype.sort` is stable, so ties keep first-seen order unless a
 * `tieBreak` comparator is supplied (e.g. name ascending, capacity desc).
 */
export function sortedByMetricDesc<T>(
  rows: readonly T[],
  metricOf: (row: T) => number,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  return [...rows].sort(
    (a, b) => metricOf(b) - metricOf(a) || (tieBreak ? tieBreak(a, b) : 0),
  );
}

/**
 * The reports' shared ratio formatting: `numerator / denominator` rounded to
 * 4 decimals, with a zero denominator (no capacity / no past bookings)
 * reading as 0 rather than NaN.
 */
export function roundedRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}
