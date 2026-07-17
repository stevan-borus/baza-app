/**
 * Calendar-date helpers for values a human picked as a DAY, not an instant.
 *
 * A date-mode picker hands back a Date carrying the wall-clock time the admin
 * happened to tap it (e.g. "July 20, 14:51"). Anything that treats the pick as
 * a validity boundary — package startsAt, filters — must normalize to local
 * start-of-day first, or same-day items earlier in the day fall outside the
 * window (the "package starts July 20 but the 06:30 class isn't bookable" bug).
 */
export function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
