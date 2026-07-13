/**
 * Overuse guard math, DB-free so it can be unit-tested in isolation.
 *
 * A client may reserve one more session against a package only while the
 * number of sessions they ALREADY hold (future uncancelled bookings backed by
 * the package + waitlist entries for the class) is strictly below the
 * package's remaining count. `sessionsRemaining` is decremented later, at
 * consumption (session-end cron / late-cancel forfeit) — so at booking time we
 * count holds against the un-decremented remaining instead.
 */
export function canHoldAnotherBooking(input: {
  sessionsRemaining: number;
  heldCount: number;
}): boolean {
  return input.heldCount < input.sessionsRemaining;
}

/**
 * True when the booking currently being considered would take the client's
 * LAST bookable slot on the package — i.e. after their existing holds there
 * is exactly one slot left. Drives the "this booking uses up your package,
 * renew to keep training" warning in the booking sheet.
 */
export function isLastBookableSlot(input: {
  sessionsRemaining: number;
  heldCount: number;
}): boolean {
  return input.sessionsRemaining - input.heldCount === 1;
}

/**
 * How many MORE sessions the client can reserve right now — the number the
 * client-facing UI shows. `sessionsRemaining` is "not yet consumed" (credits),
 * which users misread as "still bookable"; the difference is the held count
 * (future uncancelled bookings + waitlist seats). Clamped at zero because
 * admin-side reservations can legitimately push holds past remaining.
 */
export function bookableSessions(input: {
  sessionsRemaining: number;
  heldCount: number;
}): number {
  return Math.max(0, input.sessionsRemaining - input.heldCount);
}
