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

    // The closed state reads as a lock on the capacity pill, not a word — so
    // the assertion is the mark's presence and its a11y label, which is what
    // has to survive however the mark is drawn.
    const mark = screen.getByTestId("session-block-empty-cutoff-s1");
    expect(mark).toBeTruthy();
    expect(mark.getAttribute("aria-label")).toBe(
      "Prijave zatvorene — nema prijavljenih klijenata",
    );
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

function bookingRow(n: number) {
  return {
    id: `b${n}`,
    clientProfileId: `cp${n}`,
    createdAt: "2026-06-01T00:00:00.000Z",
    client: {
      id: `c${n}`,
      fullName: `Klijent ${n}`,
      email: `c${n}@test.local`,
    },
    consentFlags: {
      showFirstPilatesHint: false,
      conditions: [] as string[],
      conditionsOther: null,
      additionalNotes: null,
      intakeRecorded: true,
      intakeWithdrawn: false,
      socialMediaAccepted: true,
    },
  };
}

function sessionDetail(opts: {
  emptyCutoffLocked: boolean;
  bookedCount?: number;
  capacity?: number;
  roomName?: string;
  trainerFullName?: string;
}) {
  const bookedCount = opts.bookedCount ?? 0;
  // The header count is `bookings.length`, not the payload field, so a roster
  // has to be real for the capacity to read anything but 0/N.
  const bookings = Array.from({ length: bookedCount }, (_, i) =>
    bookingRow(i + 1),
  );
  return {
    success: true,
    session: {
      id: "s1",
      startsAt: "2026-06-10T18:00:00.000Z",
      endsAt: "2026-06-10T18:50:00.000Z",
      status: "SCHEDULED" as const,
      capacity: opts.capacity ?? 6,
      isActive: true,
      classTypeId: "ct1",
      roomId: "r1",
      trainerUserId: "t1",
      recurringScheduleId: null,
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: opts.roomName ?? "Sala 1" },
      trainer: { id: "t1", fullName: opts.trainerFullName ?? "Trainer T" },
      bookedCount,
      seriesBookedCount: bookedCount,
      emptyCutoffLocked: opts.emptyCutoffLocked,
      emptyBookingCutoffHours: 4,
      bookings,
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
        "Prijave su zatvorene — niko se nije prijavio do 4 časa pre početka.",
      ),
    ).toBeTruthy();
  });

  it("shows nothing when the session is not locked", () => {
    const screen = renderDetail(sessionDetail({ emptyCutoffLocked: false }));

    expect(screen.queryByTestId("session-detail-empty-cutoff")).toBeNull();
  });
});

/**
 * Header meta row with a long room name.
 *
 * The three meta items (trainer · room · booked/capacity) sat on one
 * non-wrapping row of unshrinkable children. "Reformer room 1 (dugačko ime
 * sale)" pushed the capacity item past the card's right edge, where it got
 * clipped — the studio saw "3/" and nothing else. Capacity is the item staff
 * actually read off this card, so it must hold its width while the two text
 * items yield.
 */
function longRoomSessionDetail() {
  return sessionDetail({
    emptyCutoffLocked: false,
    bookedCount: 3,
    capacity: 8,
    roomName: "Reformer room 1 (dugačko ime sale)",
    trainerFullName: "Aleksandra Petrović-Jovanović",
  });
}

describe("SessionDetail header with a long room name", () => {
  it("keeps the capacity inside the header card", () => {
    const screen = renderDetail(longRoomSessionDetail());

    const capacity = screen.getByTestId("session-detail-capacity");
    expect(capacity.textContent).toContain("3/8");

    const card = screen
      .getByTestId("session-detail-header-card")
      .getBoundingClientRect();
    const box = capacity.getBoundingClientRect();

    // Sub-pixel rounding from react-native-web's layout makes an exact
    // compare flaky, hence the 1px slack (same tolerance as the hero specs).
    expect(box.right).toBeLessThanOrEqual(card.right + 1);
    expect(box.left).toBeGreaterThanOrEqual(card.left - 1);
    expect(box.width).toBeGreaterThan(0);
  });

  it("lets the text meta items shrink and pins the capacity", () => {
    const screen = renderDetail(longRoomSessionDetail());

    const room = screen.getByTestId("session-detail-room");
    const trainer = screen.getByTestId("session-detail-trainer");
    const capacityItem = screen.getByTestId("session-detail-capacity-item");

    // minWidth:0 is the load-bearing half — without it a flex item's
    // min-width is its content and it refuses to shrink at all.
    for (const text of [room, trainer]) {
      expect(text.style.flexShrink).toBe("1");
      expect(text.style.minWidth).toBe("0px");
      expect(text.parentElement!.style.flexShrink).toBe("1");
      expect(text.parentElement!.style.minWidth).toBe("0px");
    }

    expect(capacityItem.style.flexShrink).toBe("0");
  });
});
