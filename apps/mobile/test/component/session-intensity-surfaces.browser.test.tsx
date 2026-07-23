/**
 * The read surfaces that render a session's intensity dots. Real Chromium +
 * shipped i18n. Each surface shows the meter when the session is marked (1–3)
 * and nothing when it's unmarked — the previous production bug was a field
 * present in one place and silently missing in another, so these pin presence
 * on every card that renders a session.
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

function scheduleSession(intensity: number | null) {
  return {
    id: "s1",
    classTypeName: "Reformer pilates",
    startsAt: new Date("2026-06-10T10:00:00Z"),
    endsAt: new Date("2026-06-10T11:00:00Z"),
    roomName: "Sala 1",
    availableSlots: 3,
    capacity: 6,
    intensity,
  };
}

function clientBooking(intensity: number | null): ClientBooking {
  return {
    id: "b1",
    status: "CONFIRMED",
    bookedAt: "2026-06-01T10:00:00.000Z",
    canceledAt: null,
    session: {
      id: "s1",
      startsAt: "2026-06-10T10:00:00.000Z",
      endsAt: "2026-06-10T11:00:00.000Z",
      intensity,
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: "Sala 1" },
      trainer: { id: "t1", fullName: "Trainer T" },
    },
  };
}

describe("ScheduleRow intensity", () => {
  it("shows the dots when the session is marked", () => {
    const screen = render(
      <ScheduleRow session={scheduleSession(2)} onPress={noop} />,
    );
    expect(screen.getByTestId("intensity-dots")).toBeTruthy();
  });

  it("shows no dots when the session is unmarked", () => {
    const screen = render(
      <ScheduleRow session={scheduleSession(null)} onPress={noop} />,
    );
    expect(screen.queryByTestId("intensity-dots")).toBeNull();
  });
});

describe("BookingRow intensity", () => {
  it("shows the dots when the booked session is marked", () => {
    const screen = render(<BookingRow booking={clientBooking(3)} />);
    expect(screen.getByTestId("intensity-dots")).toBeTruthy();
  });

  it("shows no dots when the booked session is unmarked", () => {
    const screen = render(<BookingRow booking={clientBooking(null)} />);
    expect(screen.queryByTestId("intensity-dots")).toBeNull();
  });
});

function timeBlock(intensity: number | null) {
  return {
    id: "s1",
    startsAt: "2026-06-10T10:00:00.000Z",
    endsAt: "2026-06-10T11:00:00.000Z",
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    bookedCount: 3,
    capacity: 6,
    intensity,
  };
}

describe("TimeAxisDayView intensity (admin pregled / trainer raspored)", () => {
  it("shows the dots on a marked session block", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[timeBlock(2)]}
        onSessionPress={noop}
        embedded
      />,
    );
    expect(screen.getByTestId("intensity-dots")).toBeTruthy();
  });

  it("shows no dots on an unmarked session block", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[timeBlock(null)]}
        onSessionPress={noop}
        embedded
      />,
    );
    expect(screen.getByTestId("session-block-s1")).toBeTruthy();
    expect(screen.queryByTestId("intensity-dots")).toBeNull();
  });
});
