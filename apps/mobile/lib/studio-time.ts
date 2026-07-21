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
