import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { STUDIO_TIMEZONE, startOfStudioDay } from "@/lib/studio-time";
import { now } from "@/lib/now";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * The `{ from, to }` window a report query needs for "this month" to mean
 * what the studio owner means: the calendar month containing the CURRENT
 * studio day, bounded by the 05:00 Belgrade opening hour the rest of the app
 * already uses for day edges.
 *
 * The month is read off `startOfStudioDay(now())` rather than the raw
 * instant, so 02:00 on the 1st still reports the month that is closing —
 * the studio is shut and yesterday's day has not ended yet.
 */
export function currentStudioMonthWindow(): { from: string; to: string } {
  const studioDay = dayjs(startOfStudioDay(now())).tz(STUDIO_TIMEZONE);
  const { from, to } = studioMonthRange(studioDay.year(), studioDay.month() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
