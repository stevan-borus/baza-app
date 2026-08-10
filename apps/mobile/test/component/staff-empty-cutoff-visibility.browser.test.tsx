/**
 * Staff-facing empty-cutoff surfaces — real Chromium, real react-native-web,
 * shipped Serbian copy.
 *
 * The cutoff closes signup on an empty session before it starts, but staff
 * bypass the rule, so nothing in their UI changed when it shipped: a closed
 * slot looked exactly like an ordinary empty one. Both staff read surfaces
 * have to say so — the day-view block at a glance, the detail screen in words.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { TimeAxisDayView } from "@/components/ui/time-axis-day-view";
import { renderWithQueryClient } from "./helpers";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";

const noop = () => {};

function dayViewSession(emptyCutoffLocked: boolean) {
  return {
    id: "s1",
    startsAt: "2026-06-10T18:00:00.000Z",
    endsAt: "2026-06-10T18:50:00.000Z",
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    bookedCount: 0,
    capacity: 6,
    emptyCutoffLocked,
  };
}

describe("TimeAxisDayView empty-cutoff chip", () => {
  it("shows the closed chip on a locked session block", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[dayViewSession(true)]}
        onSessionPress={noop}
      />,
    );

    expect(screen.getByTestId("session-block-empty-cutoff-s1")).toBeTruthy();
    expect(screen.getByText("Zatvoreno")).toBeTruthy();
  });

  it("shows no chip when the session is not locked", () => {
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[dayViewSession(false)]}
        onSessionPress={noop}
      />,
    );

    expect(screen.queryByTestId("session-block-empty-cutoff-s1")).toBeNull();
    expect(screen.queryByText("Zatvoreno")).toBeNull();
  });

  it("shows no chip when the field is absent (older cached payloads)", () => {
    const { emptyCutoffLocked: _omitted, ...withoutFlag } = dayViewSession(true);
    const screen = render(
      <TimeAxisDayView
        date="2026-06-10"
        sessions={[withoutFlag]}
        onSessionPress={noop}
      />,
    );

    expect(screen.queryByTestId("session-block-empty-cutoff-s1")).toBeNull();
  });
});

vi.mock("@/lib/api-request", () => ({
  apiRequest: async () => ({ success: true }),
}));

function sessionDetail(opts: {
  emptyCutoffLocked: boolean;
  bookedCount?: number;
}) {
  const bookedCount = opts.bookedCount ?? 0;
  return {
    success: true,
    session: {
      id: "s1",
      startsAt: "2026-06-10T18:00:00.000Z",
      endsAt: "2026-06-10T18:50:00.000Z",
      status: "SCHEDULED" as const,
      capacity: 6,
      isActive: true,
      classTypeId: "ct1",
      roomId: "r1",
      trainerUserId: "t1",
      recurringScheduleId: null,
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: "Sala 1" },
      trainer: { id: "t1", fullName: "Trainer T" },
      bookedCount,
      seriesBookedCount: bookedCount,
      emptyCutoffLocked: opts.emptyCutoffLocked,
      emptyBookingCutoffHours: 4,
      bookings: [],
      waitlist: [],
    },
  };
}

function renderDetail(data: ReturnType<typeof sessionDetail>) {
  return renderWithQueryClient(<SessionDetail id="s1" />, (client) => {
    client.setQueryData(sessionsQueries.byId("s1").queryKey, data);
    client.setQueryData(authQueries.me().queryKey, {
      success: true,
      user: {
        id: "admin-1",
        email: "a@b.c",
        firstName: "A",
        lastName: "Admin",
        fullName: "A Admin",
        role: "ADMIN",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        clientProfile: null,
      },
    });
  });
}

import { SessionDetail } from "@/components/admin/session-detail";

describe("SessionDetail empty-cutoff notice", () => {
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("explains that signups closed, naming the cutoff window", () => {
    const screen = renderDetail(sessionDetail({ emptyCutoffLocked: true }));

    expect(screen.getByTestId("session-detail-empty-cutoff")).toBeTruthy();
    expect(
      screen.getByText(
        "Prijave su zatvorene — niko se nije prijavio do 4 h pre početka. Termin neće biti održan osim ako administrator ručno ne upiše klijenta.",
      ),
    ).toBeTruthy();
  });

  it("shows nothing when the session is not locked", () => {
    const screen = renderDetail(sessionDetail({ emptyCutoffLocked: false }));

    expect(screen.queryByTestId("session-detail-empty-cutoff")).toBeNull();
  });
});
