import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import {
  STUDIO_TIMEZONE,
  startOfStudioDay,
  studioDayStartForKey,
} from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

type PackageForSuggestion = {
  /** ISO string, as returned by the client-packages response. */
  expiresAt: string;
  sessionsRemaining: number;
};

/**
 * The day the assign / payment date picker should open on.
 *
 * Clients typically renew AT their last session, while the old package is
 * still technically valid. Defaulting to "today" there starts the new pack
 * midway through the old one — two live packages, and the admin has to
 * notice and correct the date every time. So when the client still has a
 * usable package, the suggestion is the day AFTER its last one runs out:
 * the packs queue instead of overlapping, and no day is lost between them.
 *
 * "Usable" deliberately means date-valid AND has sessions left. A package
 * with zero sessions remaining is spent even if its validity runs for weeks;
 * queueing behind that would lock the client out of the pack they just paid
 * for. Same for stacking — the suggestion clears the LATEST expiry, so a
 * third package lands after the second rather than on top of it.
 *
 * This is only ever a SUGGESTION: the picker stays editable and the admin
 * can start a package whenever they like.
 */
export function suggestedPackageStart(
  packages: ReadonlyArray<PackageForSuggestion>,
  at: Date,
): Date {
  const usableExpiries = packages
    .filter((pkg) => pkg.sessionsRemaining > 0)
    .map((pkg) => new Date(pkg.expiresAt))
    .filter((expiresAt) => expiresAt > at);

  if (usableExpiries.length === 0) return startOfStudioDay(at);

  const lastExpiry = usableExpiries.reduce((latest, candidate) =>
    candidate > latest ? candidate : latest,
  );
  // The calendar day AFTER the one the last package dies on, resolved in the
  // studio's zone and then re-stamped at the opening hour — the same
  // day-not-instant reading the picker itself uses.
  const dayAfter = dayjs(lastExpiry).tz(STUDIO_TIMEZONE).add(1, "day");
  return studioDayStartForKey(dayAfter.format("YYYY-MM-DD"));
}
