/** Shared package-card math: fully-booked predicate + progress-bar fraction. */

/**
 * Fraction (0..1) the package progress bar should fill on BOTH the home card
 * and the profile "Moji paketi" row.
 *
 * The bar is CREDITS-driven: `sessionsRemaining / sessionCount` — "how much of
 * the package is still left", depleting only as sessions are actually consumed
 * (attendance / forfeit). It is deliberately NOT bookable-driven: a fully-booked
 * but active package (bookable === 0, credits still remaining) must NOT read as
 * an empty bar — the credits are still there, just held by future bookings. The
 * displayed NUMBER stays "bookable / total"; only the bar uses this fraction.
 */
export function packageCreditsRemainingFraction(
  sessionsRemaining: number,
  sessionCount: number,
): number {
  if (sessionCount <= 0) return 0;
  const clamped = Math.max(0, Math.min(sessionsRemaining, sessionCount));
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
