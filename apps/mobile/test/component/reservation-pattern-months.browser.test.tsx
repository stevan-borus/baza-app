/**
 * Admin reservation mode — the "Obrazac" pattern sweep and the confirm sheet,
 * in real Chromium with real RNW rendering and the shipped Serbian copy.
 *
 * The bug these lock down: the screen only ever loads ONE month of
 * availability (`availabilityByMonth(month)` keyed off the visible week). A
 * 12-week pattern applied near month end therefore had nothing but that
 * month's leftovers to match — the admin asked for 12 weeks and got 2
 * sessions. And because the confirm sheet resolved the selected ids against
 * that same single-month array, anything selected outside the visible month
 * silently vanished from the count and from the mutation's `sessionIds`.
 *
 * `apiRequest` is stubbed at the transport seam (same idiom as
 * paketi-tab-add-session) so the test can see WHICH months the screen asks
 * for; everything above it — query factory, selection state machine, sheets,
 * i18n — is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import dayjs from "dayjs";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

const HOUR = 60 * 60 * 1000;

/**
 * "Today" for this spec: Wednesday 2026-05-27 — four days from month end, the
 * exact shape of the user's report ("close to the end of the month").
 */
const TODAY = dayjs("2026-05-27T09:00:00");

type WireSession = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  classTypeName: string;
  roomName: string | null;
  trainerName: string | null;
  bookedCount: number;
  waitlistCount: number;
  availableSlots: number;
};

/** A Monday-07:00 session `weeksOut` weeks after the first Monday on/after TODAY. */
function mondayAt7(weeksOut: number, overrides: Partial<WireSession> = {}): WireSession {
  // First Monday strictly after TODAY (Wed 2026-05-27) is 2026-06-01.
  const startsAt = dayjs("2026-06-01T07:00:00").add(weeksOut, "week");
  return {
    id: `mon-${weeksOut}`,
    startsAt: startsAt.toDate(),
    endsAt: startsAt.add(1, "hour").toDate(),
    capacity: 6,
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    trainerName: "Trainer Reformer Lead",
    bookedCount: 2,
    waitlistCount: 0,
    availableSlots: 4,
    ...overrides,
  };
}

/**
 * A weekly Monday 07:00 series running 12 weeks out from TODAY — deliberately
 * spread across May, June, July and August so a single-month fetch can only
 * ever see a fraction of it.
 */
const MONDAY_SERIES = Array.from({ length: 12 }, (_, i) => mondayAt7(i));

/** Sessions grouped the way `/api/sessions/availability?month=` returns them. */
function sessionsForMonth(month: string): WireSession[] {
  return MONDAY_SERIES.filter((s) => dayjs(s.startsAt).format("YYYY-MM") === month);
}

/** Every month key the availability endpoint was asked for, in call order. */
const requestedMonths: string[] = [];

const apiRequestMock = vi.fn(
  async (path: string, opts?: { params?: Record<string, unknown> }) => {
    if (path === "/api/sessions/availability") {
      const month = String(opts?.params?.month ?? "");
      requestedMonths.push(month);
      return { success: true, month, sessions: sessionsForMonth(month) };
    }
    if (path === "/api/auth/me") {
      return { user: { id: "admin-1", email: "a@b.c", role: "ADMIN", isActive: true } };
    }
    if (path.startsWith("/api/bookings")) {
      return { success: true, bookings: [], nextCursor: null };
    }
    if (path.startsWith("/api/packages/client")) {
      return {
        success: true,
        packages: [
          {
            id: "pkg-1",
            clientProfileId: "client-1",
            packageTypeId: "type-1",
            startsAt: new Date(TODAY.valueOf() - 24 * HOUR).toISOString(),
            expiresAt: new Date(TODAY.valueOf() + 60 * 24 * HOUR).toISOString(),
            sessionsRemaining: 20,
            sessionsTotal: 20,
            packageType: { name: "Reformer 20", sessionCount: 20, validityDays: 90 },
          },
        ],
      };
    }
    return { success: true };
  },
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

// The screen reads the bound client off the route; give it one so the pattern
// affordance and the confirm sheet are both reachable.
vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => ({
      clientProfileId: "client-1",
      clientUserId: "user-1",
      clientFullName: "Ana Anić",
    }),
  };
});

import { ReservationMode } from "@/components/admin/reservation-mode";

beforeEach(async () => {
  // The previous test's teardown can leave an availability fetch in flight;
  // let it land before clearing, or its month shows up in this test's log.
  await new Promise((resolve) => setTimeout(resolve, 0));
  apiRequestMock.mockClear();
  requestedMonths.length = 0;
  process.env.TEST_ANCHOR_TIME = TODAY.toISOString();
});

/**
 * Open the Obrazac sheet, pick Monday 07:00, set the week count, apply, and
 * return every month the screen asked availability for.
 *
 * The screen's own visible-month query counts too — it asks for the month the
 * week strip is parked on, which is the pattern's first month anyway.
 */
async function applyMondayPattern(
  screen: ReturnType<typeof renderWithQueryClient>,
  weeks: string,
): Promise<string[]> {
  fireEvent.click(await screen.findByTestId("reservation-open-pattern-sheet"));
  // Weekday glyphs are Mon-first; the first cell is Monday.
  const monday = (await screen.findAllByText("P"))[0];
  fireEvent.click(monday);
  const weeksInput = screen.getByDisplayValue("12") as HTMLInputElement;
  // React's controlled <input> ignores a plain value assignment — go through
  // the native setter so the change event carries the new value.
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setValue.call(weeksInput, weeks);
  fireEvent.change(weeksInput);
  await waitFor(() => expect(weeksInput.value).toBe(weeks));

  fireEvent.click(screen.getByTestId("reservation-pattern-apply"));
  // Apply resolves once every month in the range has landed — the sheet
  // closing is the signal.
  await waitFor(() =>
    expect(screen.queryByTestId("reservation-pattern-apply")).toBeNull(),
  );
  return [...new Set(requestedMonths)].sort();
}

describe("Obrazac pattern — month span", () => {
  it("fetches every month a 12-week pattern spans, not just the visible one", async () => {
    const screen = renderWithQueryClient(<ReservationMode />);
    const months = await applyMondayPattern(screen, "12");

    // TODAY is 2026-05-27; +12 weeks lands in August.
    expect(new Set(months)).toEqual(
      new Set(["2026-05", "2026-06", "2026-07", "2026-08"]),
    );
  });

  it("selects the whole 12-week series, not just the current month's leftovers", async () => {
    // The reported symptom: "2 sessions instead of 15+". Every Monday in the
    // window is open, so all 12 must land in the selection count.
    const screen = renderWithQueryClient(<ReservationMode />);
    await applyMondayPattern(screen, "12");

    const toolbar = screen.getByTestId("reservation-toolbar-cta").parentElement!;
    await waitFor(() => {
      expect(toolbar.textContent).toContain("12");
    });
  });

  it("carries the cross-month selection into the confirm sheet's breakdown", async () => {
    const screen = renderWithQueryClient(<ReservationMode />);
    await applyMondayPattern(screen, "12");

    fireEvent.click(screen.getByTestId("reservation-toolbar-cta"));

    // The breakdown row names the class type and its count — before the fix
    // this counted only the slice of the series the visible month happened to
    // hold (2 of 12), because the sheet resolved ids against that array.
    await screen.findByTestId("reservation-confirm-sheet-cta");
    const row = screen.getByText("Reformer pilates").parentElement!;
    expect(row.textContent).toContain("12");
  });

  it("re-uses the cached month instead of refetching it for the sweep", async () => {
    // The visible month is already in cache when Apply runs; the sweep must
    // ride the factory's own staleTime rather than forcing a fresh request
    // per month (which is what a naive "just fetch everything" fix would do).
    const screen = renderWithQueryClient(<ReservationMode />);
    await applyMondayPattern(screen, "12");

    const mayRequests = requestedMonths.filter((m) => m === "2026-05");
    expect(mayRequests).toHaveLength(1);
  });
});
