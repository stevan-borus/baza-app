/**
 * Report utilities: date parsing, bucket labels (day/week/month), timeframe normalization.
 */
import type { ReportsPeriod } from "@baza/types";
import { now } from "@/lib/now";

const DAY_MS = 24 * 60 * 60 * 1000;

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
 */
export function parseReportTimeframe(searchParams: URLSearchParams): Timeframe | null {
  const from = parseDateInput(searchParams.get("from"));
  const to = parseDateInput(searchParams.get("to"));
  const period = searchParams.get("period");
  const includeDeltas = searchParams.get("includeDeltas") === "true";

  const finalTo = to ?? now();
  const finalFrom = from ?? new Date(finalTo.getTime() - 30 * DAY_MS);
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
 */
export type RevenueBucketSize = "day" | "week" | "month";

/**
 * Maps the UI period pill value to the bucket granularity the time-series
 * endpoint should emit. Anything unrecognized falls back to daily so the
 * caller always gets *some* shape.
 */
export function bucketSizeForPeriod(period: string | null | undefined): RevenueBucketSize {
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
 * Advance a bucket-start by one bucket of the given size.
 */
function advanceBucket(start: Date, size: RevenueBucketSize): Date {
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
  // month
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/**
 * Build the inclusive set of bucket starts covering `[from, to)`. The first
 * bucket is `from` floored to the bucket's natural alignment (UTC midnight /
 * Monday / first-of-month). Bucket boundaries are exclusive on the right, so
 * the last bucket may extend past `to` — callers can clip when displaying.
 */
export function buildRevenueBuckets(
  from: Date,
  to: Date,
  size: RevenueBucketSize,
): Array<{ bucketStart: Date; bucketEnd: Date }> {
  const alignedStart =
    size === "day"
      ? floorUtcDay(from)
      : size === "week"
        ? floorUtcWeek(from)
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
