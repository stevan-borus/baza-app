import { computePeriodWindow } from "@/lib/admin/use-period-pill";
import { now } from "@/lib/now";

/**
 * The `{ from, to }` window a report query needs for "this month" to mean what
 * the studio owner means: the calendar month containing the CURRENT studio
 * day, bounded by the 05:00 Belgrade opening hour.
 *
 * This is the report pills' own month window with the period fixed — the
 * dashboard hero and Izveštaji → Mesec have to agree on where a month starts,
 * and two implementations of that is how they stopped agreeing in the first
 * place.
 */
export function currentStudioMonthWindow(): { from: string; to: string } {
  const { from, to } = computePeriodWindow("month", now());
  // Only "all" yields an open-ended window, and this is always "month".
  return { from: from as string, to: to as string };
}
