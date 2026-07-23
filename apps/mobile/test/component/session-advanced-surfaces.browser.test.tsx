/**
 * The read surfaces that render a session's "advanced" badge. Real Chromium +
 * shipped i18n. Each surface shows the badge when the session is marked and
 * nothing when it's unmarked — the previous production bug was a field present
 * in one place and silently missing in another, so these pin presence on every
 * card that renders a session.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { ScheduleRow } from "@/components/ui/schedule-row";
import { BookingRow } from "@/components/admin/booking-row";
import { TimeAxisDayView } from "@/components/ui/time-axis-day-view";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

const noop = () => {};

function scheduleSession(isAdvanced: boolean) {
  return {
    id: "s1",
    classTypeName: "Reformer pilates",
    startsAt: new Date("2026-06-10T10:00:00Z"),
    endsAt: new Date("2026-06-10T11:00:00Z"),
    roomName: "Sala 1",
    availableSlots: 3,
    capacity: 6,
    isAdvanced,
  };
}

function clientBooking(isAdvanced: boolean): ClientBooking {
  return {
    id: "b1",
    status: "CONFIRMED",
    bookedAt: "2026-06-01T10:00:00.000Z",
    canceledAt: null,
    session: {
      id: "s1",
      startsAt: "2026-06-10T10:00:00.000Z",
      endsAt: "2026-06-10T11:00:00.000Z",
      isAdvanced,
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: "Sala 1" },
      trainer: { id: "t1", fullName: "Trainer T" },
    },
  };
}

describe("ScheduleRow advanced badge", () => {
  it("shows the badge when the session is marked advanced", () => {
    const screen = render(
      <ScheduleRow session={scheduleSession(true)} onPress={noop} />,
    );
    expect(screen.getByTestId("advanced-badge")).toBeTruthy();
    expect(screen.getByText("Napredno")).toBeTruthy();
  });

  it("shows no badge when the session is unmarked", () => {
    const screen = render(
      <ScheduleRow session={scheduleSession(false)} onPress={noop} />,
    );
    expect(screen.queryByTestId("advanced-badge")).toBeNull();
  });
});

describe("BookingRow advanced badge", () => {
  it("shows the badge when the booked session is marked advanced", () => {
    const screen = render(<BookingRow booking={clientBooking(true)} />);
    expect(screen.getByTestId("advanced-badge")).toBeTruthy();
  });

  it("shows no badge when the booked session is unmarked", () => {
    const screen = render(<BookingRow booking={clientBooking(false)} />);
    expect(screen.queryByTestId("advanced-badge")).toBeNull();
  });
});

function timeBlock(isAdvanced: boolean) {
  return {
    id: "s1",
    startsAt: "2026-06-10T10:00:00.000Z",
    endsAt: "2026-06-10T11:00:00.000Z",
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    bookedCount: 3,
    capacity: 6,
    isAdvanced,
  };
}

describe("TimeAxisDayView advanced badge (admin pregled / trainer raspored)", () => {
  it("shows the badge on a marked session block", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[timeBlock(true)]}
        onSessionPress={noop}
        embedded
      />,
    );
    expect(screen.getByTestId("advanced-badge")).toBeTruthy();
  });

  it("shows no badge on an unmarked session block", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[timeBlock(false)]}
        onSessionPress={noop}
        embedded
      />,
    );
    expect(screen.getByTestId("session-block-s1")).toBeTruthy();
    expect(screen.queryByTestId("advanced-badge")).toBeNull();
  });
});
