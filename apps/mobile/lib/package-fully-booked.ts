/** Home PackageCard hint predicate. */

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
