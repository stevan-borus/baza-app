/**
 * Admin reservation mode — the Apply path of the "Obrazac" pattern sheet:
 * localization of the sheet's copy, error feedback when a month fetch fails,
 * invalidation of an in-flight apply when the context changes, and the
 * completeness of the already-booked set the sweep checks against.
 *
 * Same transport-seam idiom as reservation-pattern-months: `apiRequest` is
 * stubbed so tests control per-month availability and per-page bookings;
 * everything above it — query factory, selection machine, sheets, i18n — is
 * real. Handlers are swappable per test via the `impl` box below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import dayjs from "dayjs";
import i18n from "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

const HOUR = 60 * 60 * 1000;

/** "Today": Wednesday 2026-05-27, four days from month end. */
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

/** A Monday-07:00 session `weeksOut` weeks after the first Monday after TODAY. */
function mondayAt7(weeksOut: number): WireSession {
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
  };
}

const MONDAY_SERIES = Array.from({ length: 12 }, (_, i) => mondayAt7(i));

function sessionsForMonth(month: string): WireSession[] {
  return MONDAY_SERIES.filter((s) => dayjs(s.startsAt).format("YYYY-MM") === month);
}

/** A wire booking row (clientBookingItemSchema shape) for a series session. */
function wireBooking(session: WireSession) {
  return {
    id: `booking-${session.id}`,
    status: "CONFIRMED" as const,
    bookedAt: new Date(TODAY.valueOf() - 24 * HOUR).toISOString(),
    canceledAt: null,
    session: {
      id: session.id,
      startsAt: dayjs(session.startsAt).toISOString(),
      endsAt: dayjs(session.endsAt).toISOString(),
      classType: { id: "ct-1", name: session.classTypeName },
      room: { id: "room-1", name: session.roomName ?? "Sala 1" },
      trainer: null,
    },
  };
}

/**
 * Per-test swappable transport handlers. Defaults model the happy path;
 * individual tests override the field they care about.
 */
const impl = {
  availability: (month: string): Promise<unknown> | unknown => ({
    success: true,
    month,
    sessions: sessionsForMonth(month),
  }),
  clientBookings: (_cursor: string | null): Promise<unknown> | unknown => ({
    success: true,
    bookings: [],
    nextCursor: null,
  }),
};

const apiRequestMock = vi.fn(
  async (path: string, opts?: { params?: Record<string, unknown> }) => {
    if (path === "/api/sessions/availability") {
      return impl.availability(String(opts?.params?.month ?? ""));
    }
    if (path.startsWith("/api/clients/") && path.endsWith("/bookings")) {
      const cursor = opts?.params?.cursor;
      return impl.clientBookings(cursor == null ? null : String(cursor));
    }
    if (path === "/api/auth/me") {
      return { user: { id: "admin-1", email: "a@b.c", role: "ADMIN", isActive: true } };
    }
    return { success: true };
  },
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => ({
      clientProfileId: "client-1",
      clientUserId: "user-1",
      clientFullName: "Ana Anić",
    }),
    // The clear flow also wipes the URL params; the base stub's router has no
    // setParams, and the throw would abort onClear before it resets anything.
    useRouter: () => ({
      replace: () => {},
      push: () => {},
      back: () => {},
      setParams: () => {},
    }),
  };
});

import { ReservationMode } from "@/components/admin/reservation-mode";

beforeEach(async () => {
  // Let a straggler fetch from the previous test land before resetting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  apiRequestMock.mockClear();
  impl.availability = (month) => ({
    success: true,
    month,
    sessions: sessionsForMonth(month),
  });
  impl.clientBookings = () => ({ success: true, bookings: [], nextCursor: null });
  process.env.TEST_ANCHOR_TIME = TODAY.toISOString();
});

afterEach(async () => {
  await i18n.changeLanguage("sr");
});

/** Open the Obrazac sheet and pick Monday 07:00 (weeks input left at 12). */
async function openSheetAndPickMonday(
  screen: ReturnType<typeof renderWithQueryClient>,
) {
  fireEvent.click(await screen.findByTestId("reservation-open-pattern-sheet"));
  // Weekday glyphs are Mon-first; the first cell is Monday.
  const monday = (await screen.findAllByText(i18n.language === "en" ? "M" : "P"))[0];
  fireEvent.click(monday);
}

describe("pattern apply — month fetch failure", () => {
  it("keeps the sheet open with an error line and selects nothing", async () => {
    impl.availability = (month) => {
      if (month === "2026-07") return Promise.reject(new Error("network down"));
      return { success: true, month, sessions: sessionsForMonth(month) };
    };

    const screen = renderWithQueryClient(<ReservationMode />);
    await openSheetAndPickMonday(screen);
    fireEvent.click(screen.getByTestId("reservation-pattern-apply"));

    // The failure must be told to the admin inside the sheet, in the
    // shipped Serbian copy — not swallowed as an unhandled rejection.
    const error = await screen.findByTestId("reservation-pattern-error");
    expect(error.textContent).toBe("Nije moguće učitati termine. Pokušaj ponovo.");

    // The sheet stays open, the button is back to its idle label (ready to
    // retry), and the sweep selected nothing.
    const applyBtn = screen.getByTestId("reservation-pattern-apply");
    expect(applyBtn.textContent).toBe("Primeni");
    const toolbar = screen.getByTestId("reservation-toolbar-cta").parentElement!;
    expect(toolbar.textContent).toContain("0");
  });
});

describe("pattern apply — in-flight invalidation", () => {
  it("drops a late pattern result when the client is cleared mid-apply", async () => {
    // Hold every availability response until the test releases them —
    // modeling the slow network the race needs.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    impl.availability = async (month) => {
      await gate;
      return { success: true, month, sessions: sessionsForMonth(month) };
    };

    const screen = renderWithQueryClient(<ReservationMode />);
    await openSheetAndPickMonday(screen);
    fireEvent.click(screen.getByTestId("reservation-pattern-apply"));

    // While the fetches hang, the admin clears the bound client — the
    // selection is reset and must NOT be resurrected by the late result
    // (a selection made for one client must never leak onto the next).
    fireEvent.click(await screen.findByTestId("reservation-client-banner-clear"));

    release();
    const applyBtn = screen.getByTestId("reservation-pattern-apply");
    await waitFor(() => expect(applyBtn.textContent).toBe("Primeni"));

    const toolbar = screen.getByTestId("reservation-toolbar-cta").parentElement!;
    expect(toolbar.textContent).not.toContain("12");
    expect(toolbar.textContent).toContain("0");
  });
});

describe("pattern apply — already-booked completeness", () => {
  it("skips a booked session that sits beyond the first bookings page", async () => {
    // The screen's own bookings query only ever loads page one; the sweep
    // must walk ALL pages, or a session booked further out gets re-counted
    // as "added" and the admin is promised more reservations than the
    // server will make.
    impl.clientBookings = (cursor) =>
      cursor === null
        ? { success: true, bookings: [], nextCursor: "page-2" }
        : {
            success: true,
            bookings: [wireBooking(MONDAY_SERIES[3])],
            nextCursor: null,
          };

    const screen = renderWithQueryClient(<ReservationMode />);
    await openSheetAndPickMonday(screen);
    fireEvent.click(screen.getByTestId("reservation-pattern-apply"));
    await waitFor(() =>
      expect(screen.queryByTestId("reservation-pattern-apply")).toBeNull(),
    );

    // 12 Mondays in range, one already booked on page 2 → 11 selected.
    const toolbar = screen.getByTestId("reservation-toolbar-cta").parentElement!;
    expect(toolbar.textContent).toContain("11");
  });
});

describe("pattern sheet localization", () => {
  it("renders the Apply button from the English locale, not the Serbian defaultValue", async () => {
    await i18n.changeLanguage("en");
    const screen = renderWithQueryClient(<ReservationMode />);
    await openSheetAndPickMonday(screen);

    const applyBtn = await screen.findByTestId("reservation-pattern-apply");
    expect(applyBtn.textContent).toBe("Apply");
  });
});
