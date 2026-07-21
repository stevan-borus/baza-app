import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * The studio's wall-clock timezone. Every "calendar day" the business
 * reasons about — a package's last valid day above all — is a day in THIS
 * zone, not in the server's (Fly runs UTC) and not in the client device's.
 *
 * Hard-coded on purpose: Baza is one physical studio in Belgrade. If a
 * second location in another zone ever appears, this becomes a per-studio
 * field and every caller of the helpers below is the migration checklist.
 */
export const STUDIO_TIMEZONE = "Europe/Belgrade";

/**
 * The hour a studio day opens, in `STUDIO_TIMEZONE`.
 *
 * 05:00 rather than midnight: a package activated "on the 20th" should cover
 * every class on the 20th, and the studio's first slot is 06:00. Opening an
 * hour ahead of that leaves no bookable session stranded outside the window,
 * while keeping the boundary unambiguously "that morning" rather than the
 * middle of the night before.
 */
export const STUDIO_DAY_START_HOUR = 5;

/**
 * The instant the studio day containing `at` opened — the 05:00 Belgrade
 * boundary at or before `at`.
 *
 * This asks "which studio day is this INSTANT in?", so 02:00 resolves to the
 * previous day's 05:00: the studio is shut in the small hours and that day
 * has not closed yet.
 *
 * For a date the admin PICKED, use `studioDayStartFor` instead — a pick is a
 * calendar day, not an instant, and must never roll back to the day before.
 */
export function startOfStudioDay(at: Date): Date {
  const local = dayjs(at).tz(STUDIO_TIMEZONE);
  const dayStart = local.startOf("day").hour(STUDIO_DAY_START_HOUR);
  return (local.isBefore(dayStart) ? dayStart.subtract(1, "day") : dayStart).toDate();
}

/**
 * When the studio day *named by* `pickedDay` opens — that calendar date at
 * 05:00 Belgrade.
 *
 * Package activation runs through here so day one is a WHOLE day: without it
 * `startsAt` carries whatever wall-clock time rode along with the pick, and a
 * package "starting the 20th" silently excludes the 20th's morning classes.
 *
 * Distinct from `startOfStudioDay` precisely because a pick must not roll
 * back. A date-mode picker hands back LOCAL midnight, which on a Belgrade
 * device is 22:00Z the day before and on a UTC caller is 02:00 Belgrade —
 * both sit before the 05:00 opening, so instant-based logic would shift the
 * package a day earlier than the admin chose. The calendar date is read in
 * the STUDIO's zone, then re-stamped at the opening hour.
 *
 * Reading the day in `STUDIO_TIMEZONE` — not the runtime's — is the whole
 * point. A picker on a Belgrade device sends 22:00Z for "1 August"; the
 * server that receives it runs UTC, where that instant reads as 31 July.
 * Formatting in the runtime zone would therefore shift the package a day
 * earlier on the server while looking correct on the device (and correct in
 * a CET test run, which is how this shipped green locally and failed in CI).
 * Belgrade is where the admin, the studio and the calendar day all agree.
 */
export function studioDayStartFor(pickedDay: Date): Date {
  return studioDayStartForKey(
    dayjs(pickedDay).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD"),
  );
}

/**
 * `studioDayStartFor` for a day already identified as a `YYYY-MM-DD` key —
 * for callers that have computed the target date in the studio zone and
 * would otherwise round-trip it through a Date just to have it re-read.
 */
export function studioDayStartForKey(dayKey: string): Date {
  return dayjs.tz(dayKey, STUDIO_TIMEZONE).hour(STUDIO_DAY_START_HOUR).toDate();
}

/**
 * The last representable instant of the studio-local calendar day that
 * `at` falls on — 23:59:59.999 Belgrade time.
 *
 * This is what makes "expires 23 July" mean the client keeps the pack for
 * the WHOLE of 23 July. Expiry used to be `startsAt + validityDays * 24h`,
 * which inherited the purchase time-of-day and cut the final day short at
 * whatever o'clock they happened to pay.
 *
 * DST-correct by construction: the offset is resolved for that specific
 * date, so the boundary is 21:59:59.999Z in summer (CEST, UTC+2) and
 * 22:59:59.999Z in winter (CET, UTC+1). A fixed offset would be an hour
 * wrong for half the year.
 */
export function endOfStudioDay(at: Date): Date {
  return dayjs(at).tz(STUDIO_TIMEZONE).endOf("day").toDate();
}
