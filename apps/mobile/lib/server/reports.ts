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
