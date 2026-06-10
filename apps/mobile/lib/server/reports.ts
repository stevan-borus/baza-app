/**
 * Report utilities: date parsing, bucket labels (day/week/month), timeframe normalization.
 */
import type { ReportsPeriod } from "@baza/types";
import { now } from "@/lib/now";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve a query-string `from`/`to` pair into an "all-time" window when both
 * are missing. Time-series + heatmap endpoints need a real lower bound to
 * build their buckets — we fall back to `earliest` (typically the table's
 * MIN(createdAt)/MIN(startsAt)) so the chart spans from the studio's first
 * row to today. When `earliest` is null (empty table), we anchor to today so
 * the loop produces zero buckets and the caller short-circuits gracefully.
 */
export function resolveAllTimeWindow(
  from: Date | null,
  to: Date | null,
  earliest: Date | null,
): { from: Date; to: Date; isAllTime: boolean } | null {
  if (from && to && from < to) {
    return { from, to, isAllTime: false };
  }
  if (from || to) {
    // Partial input — treat as invalid so callers can 400.
    return null;
  }
  const finalTo = new Date(now().getTime());
  finalTo.setUTCHours(0, 0, 0, 0);
  finalTo.setUTCDate(finalTo.getUTCDate() + 1);
  const finalFrom = earliest ?? new Date(finalTo.getTime() - DAY_MS);
  return { from: finalFrom, to: finalTo, isAllTime: true };
}

export type Timeframe = {
  from: Date;
  to: Date;
  period: ReportsPeriod;
  includeDeltas: boolean;
};

/**
 * Parses an optional date query parameter.
 */
export function parseDateInput(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Builds group labels used by reports series output.
 */
export function getReportBucketLabel(date: Date, period: ReportsPeriod) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (period === "day") return `${year}-${month}-${day}`;
  if (period === "month") return `${year}-${month}`;

  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstThursdayDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 4);
  const currentThursday = new Date(date);
  const currentThursdayDay = currentThursday.getUTCDay() || 7;
  currentThursday.setUTCDate(currentThursday.getUTCDate() - currentThursdayDay + 4);
  const week = Math.floor(1 + (currentThursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${currentThursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Parses and normalizes report timeframe query params.
 *
 * When the caller passes no `from`/`to` (the "all-time" pill), we still need
 * a bounding window — most callers slot the result into a Prisma `gte`/`lt`
 * — but we want it to be effectively unbounded. `from` falls back to the
 * Unix epoch and `to` to "now" so the resulting range covers every row
 * without the helper having to know about the underlying table.
 */
export function parseReportTimeframe(searchParams: URLSearchParams): Timeframe | null {
  const from = parseDateInput(searchParams.get("from"));
  const to = parseDateInput(searchParams.get("to"));
  const period = searchParams.get("period");
  const includeDeltas = searchParams.get("includeDeltas") === "true";

  const finalTo = to ?? now();
  // When `from` is omitted entirely, treat as "all time" → epoch. When the
  // caller passes a single side we still need a sane window so the rest of
  // the pipeline doesn't blow up; the existing 30-day fallback only kicks
  // in when at least `to` was supplied.
  const finalFrom = from ?? (to ? new Date(finalTo.getTime() - 30 * DAY_MS) : new Date(0));
  const finalPeriod: ReportsPeriod =
    period === "week" || period === "month" ? period : "day";

  if (finalFrom >= finalTo) return null;

  return {
    from: finalFrom,
    to: finalTo,
    period: finalPeriod,
    includeDeltas,
  };
}

/**
 * Computes the previous period window with equal duration.
 */
export function getPreviousTimeframe(timeframe: Pick<Timeframe, "from" | "to">) {
  const durationMs = timeframe.to.getTime() - timeframe.from.getTime();
  return {
    from: new Date(timeframe.from.getTime() - durationMs),
    to: new Date(timeframe.to.getTime() - durationMs),
  };
}

/**
 * Bucket granularity used by the time-series endpoints. The period pill on
 * the UI drives this: week→day (7 bars), month→day (≤31 bars),
 * quarter→week (≈13 bars), year→month (12 bars). Daily covers both week and
 * month — the count is what differs, not the bucket shape.
 *
 * Both Prihod and Iskorišćenost time-series share this.
 */
export type BucketSize = "day" | "week" | "month" | "year";

/**
 * Maps the UI period pill value to the bucket granularity the time-series
 * endpoint should emit. Anything unrecognized falls back to daily so the
 * caller always gets *some* shape.
 *
 * `all` (the "Sve vreme" / All-time pill option) returns yearly buckets so
 * one bar = one calendar year — keeps the chart readable as the studio ages
 * instead of dumping a year's worth of daily bars.
 */
export function bucketSizeForPeriod(period: string | null | undefined): BucketSize {
  if (period === "all") return "year";
  if (period === "year") return "month";
  if (period === "quarter") return "week";
  if (period === "week" || period === "month") return "day";
  return "day";
}

/**
 * Floor a Date to UTC midnight (zero out H/M/S/ms but preserve Y/M/D).
 */
function floorUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Floor a Date to the start of its ISO week (UTC Monday 00:00).
 */
function floorUtcWeek(d: Date): Date {
  const out = floorUtcDay(d);
  // JS getUTCDay() → 0=Sun..6=Sat. ISO week starts on Monday: shift Sun=0 to 7.
  const dow = out.getUTCDay() || 7;
  out.setUTCDate(out.getUTCDate() - (dow - 1));
  return out;
}

/**
 * Floor a Date to the first day of its UTC month at midnight.
 */
function floorUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Floor a Date to the first day of its UTC year at midnight (Jan 1).
 */
function floorUtcYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * Advance a bucket-start by one bucket of the given size.
 */
function advanceBucket(start: Date, size: BucketSize): Date {
  if (size === "day") {
    const out = new Date(start);
    out.setUTCDate(out.getUTCDate() + 1);
    return out;
  }
  if (size === "week") {
    const out = new Date(start);
    out.setUTCDate(out.getUTCDate() + 7);
    return out;
  }
  if (size === "year") {
    return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  }
  // month
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/**
 * Build the inclusive set of bucket starts covering `[from, to)`. The first
 * bucket is `from` floored to the bucket's natural alignment (UTC midnight /
 * Monday / first-of-month). Bucket boundaries are exclusive on the right, so
 * the last bucket may extend past `to` — callers can clip when displaying.
 */
export function buildPeriodBuckets(
  from: Date,
  to: Date,
  size: BucketSize,
): Array<{ bucketStart: Date; bucketEnd: Date }> {
  const alignedStart =
    size === "day"
      ? floorUtcDay(from)
      : size === "week"
        ? floorUtcWeek(from)
        : size === "year"
          ? floorUtcYear(from)
          : floorUtcMonth(from);
  const out: Array<{ bucketStart: Date; bucketEnd: Date }> = [];
  let cursor = alignedStart;
  // Hard cap so a misuse can't infinite-loop the server.
  const HARD_MAX = 400;
  while (cursor < to && out.length < HARD_MAX) {
    const next = advanceBucket(cursor, size);
    out.push({ bucketStart: cursor, bucketEnd: next });
    cursor = next;
  }
  return out;
}
