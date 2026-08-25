import { studioDayKey } from "@/lib/studio-time";
import type { AvailabilitySession } from "@baza/types/scheduling";

/**
 * Does the client already hold a CONFIRMED booking on another session that
 * falls on the same studio day as `selected`?
 *
 * Waitlist spots are excluded on purpose: a waitlist hold isn't a class the
 * client is committed to, so it would warn about a clash that may never
 * happen. The day is the STUDIO's (Belgrade), never the device's — a
 * far-east/west device splits one studio day across two local dates.
 */
export function hasOtherBookingOnStudioDay(
  selected: AvailabilitySession,
  sessions: AvailabilitySession[],
): boolean {
  const selectedDay = studioDayKey(new Date(selected.startsAt));
  return sessions.some(
    (s) =>
      s.id !== selected.id &&
      s.isBookedByMe === true &&
      studioDayKey(new Date(s.startsAt)) === selectedDay,
  );
}
