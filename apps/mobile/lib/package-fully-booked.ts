/** Shared package-card math: fully-booked predicate + progress-bar fraction. */

/**
 * Fraction (0..1) the package progress bar should fill on BOTH the home card
 * and the profile "Moji paketi" row.
 *
 * The bar is USAGE-driven (owner decision): it FILLS UP as sessions are booked
 * and consumed — `used / total`, where `used = total − bookableOrRemaining`.
 * Callers pass `bookable ?? sessionsRemaining` so bookable takes precedence when
 * present. A fully-booked package (bookable === 0) reads as a FULL bar; a fresh,
 * untouched package reads as EMPTY. The displayed NUMBER stays "bookable / total";
 * only the bar uses this fraction.
 *
 * (Supersedes the earlier credits-remaining/draining bar, which the owner read
 * as backwards.)
 */
export function packageUsedFraction(
  bookableOrRemaining: number,
  sessionCount: number,
): number {
  if (sessionCount <= 0) return 0;
  const used = sessionCount - bookableOrRemaining;
  const clamped = Math.max(0, Math.min(used, sessionCount));
  return clamped / sessionCount;
}

/**
 * Returns whether the active package is fully RESERVED but not lapsed — i.e.
 * the client has booked every credit they can (`bookable === 0`) while raw
 * credits still remain (`sessionsRemaining > 0`, because held bookings still
 * count against the balance until attended).
 *
 * This is the "0 / 12" state an owner read as broken: the card is still active
 * (it is NOT the lapsed/renewal case) and must show an explanatory line. The
 * lapsed case has `sessionsRemaining === 0`, so it is excluded here and keeps
 * routing to the RenewalCard instead.
 */
export function isFullyBookedActivePackage(
  bookable: number,
  sessionsRemaining: number,
): boolean {
  return bookable === 0 && sessionsRemaining > 0;
}
