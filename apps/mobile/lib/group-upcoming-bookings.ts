/**
 * Grouping for the client "Upcoming sessions" screen.
 *
 * Walks the client's upcoming bookings (already sorted ascending by the
 * server) and emits a flat array with a day-header sentinel each time the
 * calendar day changes — so the LegendList keeps PaginatedList's
 * infinite-scroll plumbing instead of switching to SectionList.
 *
 * Bands by calendar DAY (istorija bands by month): a client browsing what's
 * coming up thinks in "today / tomorrow / Wednesday", not in months. The two
 * nearest days read "Danas" / "Sutra" (labels passed in, already localized);
 * anything further out gets a weekday-date band like the home hero.
 */
import dayjs from "dayjs";
import { formatFullDayDate } from "@/lib/format-date";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

export type UpcomingListItem =
  | { kind: "header"; id: string; label: string }
  | { kind: "booking"; id: string; booking: ClientBooking };

export function buildUpcomingListItems(
  bookings: ClientBooking[],
  lang: "sr" | "en",
  now: Date,
  labels: { today: string; tomorrow: string },
): UpcomingListItem[] {
  const today = dayjs(now).format("YYYY-MM-DD");
  const tomorrow = dayjs(now).add(1, "day").format("YYYY-MM-DD");

  const items: UpcomingListItem[] = [];
  let currentKey: string | null = null;
  for (const booking of bookings) {
    const date = dayjs(booking.session.startsAt).locale(lang);
    const key = date.format("YYYY-MM-DD");
    if (key !== currentKey) {
      currentKey = key;
      const label =
        key === today
          ? labels.today
          : key === tomorrow
            ? labels.tomorrow
            : // "Sreda 15.7." — full weekday + numeric day.month, matching
              // the compact date style the BookingRow uses for its time line.
              formatFullDayDate(date, lang);
      items.push({ kind: "header", id: `header-${key}`, label });
    }
    items.push({ kind: "booking", id: booking.id, booking });
  }
  return items;
}
