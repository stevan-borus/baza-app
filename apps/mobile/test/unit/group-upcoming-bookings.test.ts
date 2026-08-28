/**
 * Grouping math for the client "Upcoming sessions" screen.
 *
 * The upcoming list bands its (server-sorted, ascending) bookings by
 * CALENDAR DAY — unlike istorija, which bands by month — because a client
 * cares "what am I doing today / tomorrow", not "which month". The band
 * label reads "Danas" / "Sutra" for the two near days and a weekday-date
 * ("Četvrtak 16.7.") beyond that, mirroring the home hero's day label. Full
 * weekday, no comma — the studio was explicit about both.
 *
 * The helper is pure and takes `now` + `todayLabel`/`tomorrowLabel` so the
 * test pins the instant instead of racing wall-clock.
 */
import { describe, expect, it } from "vitest";
import "dayjs/locale/sr";

import {
  buildUpcomingListItems,
  type UpcomingListItem,
} from "@/lib/group-upcoming-bookings";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

function booking(id: string, startsAt: string): ClientBooking {
  return {
    id,
    status: "CONFIRMED",
    bookedAt: "2026-07-10T00:00:00.000Z",
    canceledAt: null,
    session: {
      id: `session-${id}`,
      startsAt,
      endsAt: startsAt,
      classType: { id: "ct", name: "Reformer" },
      room: null,
      trainer: null,
    },
  };
}

const now = new Date("2026-07-14T08:00:00.000Z");
const labels = { today: "Danas", tomorrow: "Sutra" };

function headers(items: UpcomingListItem[]): string[] {
  return items
    .filter((i): i is Extract<UpcomingListItem, { kind: "header" }> => i.kind === "header")
    .map((h) => h.label);
}

describe("buildUpcomingListItems", () => {
  it("emits one header per calendar day, with the bookings under it", () => {
    const items = buildUpcomingListItems(
      [
        booking("a", "2026-07-14T09:00:00.000Z"),
        booking("b", "2026-07-14T11:00:00.000Z"),
        booking("c", "2026-07-16T09:00:00.000Z"),
      ],
      "sr",
      now,
      labels,
    );

    // header(14) a b header(16) c
    expect(items.map((i) => i.kind)).toEqual([
      "header",
      "booking",
      "booking",
      "header",
      "booking",
    ]);
  });

  it("labels today as 'Danas' and tomorrow as 'Sutra'", () => {
    const items = buildUpcomingListItems(
      [
        booking("a", "2026-07-14T09:00:00.000Z"),
        booking("b", "2026-07-15T09:00:00.000Z"),
      ],
      "sr",
      now,
      labels,
    );
    expect(headers(items)).toEqual(["Danas", "Sutra"]);
  });

  it("labels a day beyond tomorrow with a full-weekday date band", () => {
    const items = buildUpcomingListItems(
      [booking("c", "2026-07-16T09:00:00.000Z")],
      "sr",
      now,
      labels,
    );
    // Full weekday + "D.M.", no comma between them.
    expect(headers(items)).toEqual(["Četvrtak 16.7."]);
  });

  it("never abbreviates the weekday in the band", () => {
    const items = buildUpcomingListItems(
      [booking("c", "2026-07-16T09:00:00.000Z")],
      "sr",
      now,
      labels,
    );
    expect(headers(items)[0]).not.toContain("Čet.");
    expect(headers(items)[0]).not.toContain(",");
  });

  it("uses the English weekday name when the language is en", () => {
    const items = buildUpcomingListItems(
      [booking("c", "2026-07-16T09:00:00.000Z")],
      "en",
      now,
      labels,
    );
    expect(headers(items)).toEqual(["Thursday 16.7."]);
  });

  it("returns an empty array for no bookings", () => {
    expect(buildUpcomingListItems([], "sr", now, labels)).toEqual([]);
  });

  it("keeps booking ids on booking items and unique header ids per day", () => {
    const items = buildUpcomingListItems(
      [
        booking("a", "2026-07-14T09:00:00.000Z"),
        booking("c", "2026-07-16T09:00:00.000Z"),
      ],
      "sr",
      now,
      labels,
    );
    const ids = items.map((i) => i.id);
    // ids are unique
    expect(new Set(ids).size).toBe(ids.length);
    const bookingItems = items.filter((i) => i.kind === "booking");
    expect(bookingItems.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
