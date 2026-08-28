/**
 * WHEN a booking was cancelled, on the row's "Otkazano" label.
 *
 * The studio wants to see when a client backed out, not just that they did —
 * that is what decides whether the cancel was fair. But the row's own subtitle
 * already prints the class date, so the first cut ("Otkazano četvrtak 27.8.
 * 18:43") stated a date twice under a line reading "Četvrtak 27.8. ·
 * 21:00–21:50". It is now the weekday alone: "Otkazano u ponedeljak".
 *
 * The same row backs the admin client-history screen and the client's own
 * history, so one change covers both roles.
 */
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { BookingRow } from "@/components/admin/booking-row";

import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

function booking(overrides: Partial<ClientBooking> = {}): ClientBooking {
  return {
    id: "b1",
    status: "CONFIRMED",
    bookedAt: "2026-06-01T10:00:00.000Z",
    canceledAt: null,
    session: {
      id: "s1",
      startsAt: "2026-06-10T10:00:00.000Z",
      endsAt: "2026-06-10T11:00:00.000Z",
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: "Sala 1" },
      trainer: { id: "t1", fullName: "Trainer T" },
    },
    ...overrides,
  };
}

// Tuesday 2026-06-09. The anchor below sits two days later, so the weekday
// still names one day and the bare-weekday form applies.
const canceled = booking({
  status: "CANCELED",
  canceledAt: "2026-06-09T14:30:00.000Z",
});

const ANCHOR = "2026-06-11T09:00:00.000Z";

describe("BookingRow cancellation timestamp", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = ANCHOR;
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("names the weekday the cancellation landed on, in the accusative", () => {
    const screen = render(<BookingRow booking={canceled} showCanceledTag />);
    const line = screen.getByTestId("booking-row-canceled-at");
    expect(line.textContent).toBe("Otkazano u utorak");
  });

  it("does not repeat the date or the clock time the row already prints", () => {
    const screen = render(<BookingRow booking={canceled} showCanceledTag />);
    const line = screen.getByTestId("booking-row-canceled-at");
    expect(line.textContent).not.toContain("9.6.");
    expect(line.textContent).not.toContain("14:30");
  });

  it("falls back to a date for a cancellation older than a week", () => {
    const screen = render(
      <BookingRow
        booking={booking({
          status: "CANCELED",
          canceledAt: "2026-05-20T14:30:00.000Z",
        })}
        showCanceledTag
      />,
    );
    expect(screen.getByTestId("booking-row-canceled-at").textContent).toBe(
      "Otkazano 20. maja",
    );
  });

  it("renders nothing extra for a booking that was never cancelled", () => {
    const screen = render(<BookingRow booking={booking()} showCanceledTag />);
    expect(screen.queryByTestId("booking-row-canceled-at")).toBeNull();
  });

  it("keeps the timestamp off the surfaces that hide the canceled tag", () => {
    // The upcoming-sessions list passes showCanceledTag={false}; a cancel
    // timestamp there would be dead weight on a row that never shows one.
    const screen = render(<BookingRow booking={canceled} />);
    expect(screen.queryByTestId("booking-row-canceled-at")).toBeNull();
  });
});
