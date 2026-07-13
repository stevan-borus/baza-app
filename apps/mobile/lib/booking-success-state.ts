/**
 * Maps a server booking-mutation `state` onto the booking sheet's visible
 * success confirmation. The sheet only renders three outcomes — BOOKED,
 * WAITLISTED, CANCELED — so every server state collapses onto one of those (or
 * null for "show no confirmation").
 *
 * Note WAITLIST_PROMOTED: the server returns it on the CANCEL path when the
 * canceling client's freed seat auto-promotes a waitlisted peer. From the
 * canceling client's own perspective that is still a successful cancel — so it
 * maps to the same CANCELED confirmation (the sheet's isLateCancel logic then
 * picks the plain-vs-forfeit variant). Mapping it to null is the bug this
 * function guards against: the canceling client would see nothing at all.
 */
export type BookingSuccessState = "BOOKED" | "WAITLISTED" | "CANCELED";

export function mapResultStateToSuccessState(
  resultState: string | undefined,
): BookingSuccessState | null {
  switch (resultState) {
    case "BOOKED":
    case "BOOKED_ALREADY":
      return "BOOKED";
    case "WAITLISTED":
      return "WAITLISTED";
    case "CANCELED":
    case "WAITLIST_PROMOTED":
      return "CANCELED";
    default:
      return null;
  }
}
