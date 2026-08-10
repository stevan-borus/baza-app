// The studio will not open a room for a class nobody has booked yet: close to
// start there is no longer time to staff it around a single late booking. Once
// any client is in, the class runs regardless, so it stays bookable until start.
export function isEmptySessionCutoffLocked({
  startsAt,
  activeBookingsCount,
  cutoffHours,
  at,
}: {
  startsAt: Date;
  activeBookingsCount: number;
  cutoffHours: number;
  at: Date;
}): boolean {
  if (activeBookingsCount > 0) return false;
  // 0 disables the rule for this class type.
  if (cutoffHours <= 0) return false;
  return startsAt.getTime() - at.getTime() < cutoffHours * 3_600_000;
}
