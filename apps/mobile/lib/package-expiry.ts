import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { STUDIO_TIMEZONE, endOfStudioDay } from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * When a package bought at `startsAt` with `validityDays` of validity stops
 * being usable: the END of its last valid studio-local day.
 *
 * Two deliberate properties, both of which the old `startsAt + N * 24h`
 * arithmetic got wrong:
 *
 * 1. **The last day is whole.** Expiry no longer inherits the purchase
 *    time-of-day, so an 08:00 buyer and a 20:00 buyer get identical
 *    expiries and neither loses the tail of their final day.
 * 2. **Validity counts calendar days, not 24h blocks.** Adding fixed
 *    milliseconds drifts by an hour across a DST transition and can land
 *    on the wrong calendar date; `.add(n, "day")` in the studio zone
 *    cannot.
 *
 * The start day is day ONE (hence `validityDays - 1`): a 1-day package is
 * valid through the end of the day it starts, and a 365-day package spans
 * 365 calendar days rather than 366.
 */
export function computePackageExpiresAt(
  startsAt: Date,
  validityDays: number,
): Date {
  const lastValidDay = dayjs(startsAt)
    .tz(STUDIO_TIMEZONE)
    .add(validityDays - 1, "day");
  return endOfStudioDay(lastValidDay.toDate());
}

/**
 * Whole studio-calendar days between `at` and the pack's expiry day —
 * the number behind "još X dana" / "X days left".
 *
 * Deliberately a CALENDAR distance, not a duration. `dayjs.diff(-, "day")`
 * truncates a 1.75-day remainder to 1, so a pack expiring 23 July
 * advertised "1 more day" on the 21st while showing the 23rd right next to
 * it — two visible days, one claimed. Comparing day-starts in the studio
 * zone makes the countdown and the date tell the same story, and makes the
 * answer independent of both the time of day and the viewer's device zone.
 *
 * Returns 0 on the expiry day itself (still bookable — it's the last
 * chance) and negative once the pack has lapsed.
 */
export function packageDaysLeft(expiresAt: Date, at: Date): number {
  const expiryDay = dayjs(expiresAt).tz(STUDIO_TIMEZONE).startOf("day");
  const currentDay = dayjs(at).tz(STUDIO_TIMEZONE).startOf("day");
  return expiryDay.diff(currentDay, "day");
}
