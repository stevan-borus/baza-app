/**
 * Unit tests for the Reservation-mode selection state machine
 * (`lib/admin/reservation-selection.ts`) — the pure module extracted from
 * `components/admin/reservation-mode.tsx`.
 *
 * These are characterization tests: they pin the behavior the component
 * shipped with (CONTEXT.md → "Admin reservation"), so the riskiest admin
 * surface (it creates real Bookings) is no longer covered only by
 * Playwright e2e (which is not in CI).
 *
 * Note on past sessions: despite the component's doc comment, the shipped
 * `toggleSession` guard treats past sessions as unselectable (and
 * `expandPattern` drops them too). The extraction preserves the shipped
 * behavior, not the comment.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import {
  applyPattern,
  classifySession,
  clearActiveSelection,
  distinctClassTypeNames,
  createInitialState,
  resetSelections,
  setClassTypeFilter,
  switchMode,
  toggleBooking,
  toggleSession,
  type SelectableSession,
  type SelectionContext,
} from "@/lib/admin/reservation-selection";

// Anchor on a Monday, consistent with reservation-pattern.test.ts.
const ANCHOR = dayjs("2026-05-11T00:00:00"); // Monday

// applyPattern delegates to expandPattern, which drops past sessions via
// `lib/now.ts:nowMs()` — pin "now" to the anchor so test sessions aren't
// all filtered as past on wall-clock (same setup as reservation-pattern.test.ts).
const prevAnchor = process.env.TEST_ANCHOR_TIME;
beforeAll(() => {
  process.env.TEST_ANCHOR_TIME = ANCHOR.toISOString();
});
afterAll(() => {
  if (prevAnchor === undefined) {
    delete process.env.TEST_ANCHOR_TIME;
  } else {
    process.env.TEST_ANCHOR_TIME = prevAnchor;
  }
});

const ctx = (alreadyBooked: string[] = []): SelectionContext => ({
  nowMs: ANCHOR.valueOf(),
  alreadyBookedSessionIds: new Set(alreadyBooked),
});

function futureSession(
  id: string,
  overrides: Partial<SelectableSession> = {},
): SelectableSession {
  return {
    id,
    startsAt: ANCHOR.add(1, "day").hour(7).toDate(),
    availableSlots: 3,
    ...overrides,
  };
}

describe("createInitialState", () => {
  it("starts in reserve mode with empty selections and no class-type filter", () => {
    const state = createInitialState();
    expect(state.mode).toBe("reserve");
    expect(state.selectedSessionIds.size).toBe(0);
    expect(state.selectedBookingIds.size).toBe(0);
    expect(state.classTypeFilter).toBe("");
  });
});

describe("toggleSession", () => {
  it("selects an available future session and deselects it on a second tap, without mutating the input state", () => {
    const s = futureSession("s1");
    const initial = createInitialState();

    const selected = toggleSession(initial, s, ctx());
    expect([...selected.selectedSessionIds]).toEqual(["s1"]);
    // Immutable transitions — the component relies on referential updates.
    expect(initial.selectedSessionIds.size).toBe(0);

    const deselected = toggleSession(selected, s, ctx());
    expect(deselected.selectedSessionIds.size).toBe(0);
  });

  it("ignores taps on past sessions (shipped guard — see file doc comment)", () => {
    const past = futureSession("past", {
      startsAt: ANCHOR.subtract(1, "hour").toDate(),
    });
    const next = toggleSession(createInitialState(), past, ctx());
    expect(next.selectedSessionIds.size).toBe(0);
  });

  it("ignores taps on full sessions (availableSlots <= 0)", () => {
    const full = futureSession("full", { availableSlots: 0 });
    const next = toggleSession(createInitialState(), full, ctx());
    expect(next.selectedSessionIds.size).toBe(0);
  });

  it("ignores taps on sessions the client already booked (Već rezervisano)", () => {
    const s = futureSession("booked");
    const next = toggleSession(createInitialState(), s, ctx(["booked"]));
    expect(next.selectedSessionIds.size).toBe(0);
  });
});

describe("toggleBooking", () => {
  it("toggles a booking id on and off with no extra guards", () => {
    const initial = createInitialState();
    const selected = toggleBooking(initial, "b1");
    expect([...selected.selectedBookingIds]).toEqual(["b1"]);
    expect(initial.selectedBookingIds.size).toBe(0);

    const deselected = toggleBooking(selected, "b1");
    expect(deselected.selectedBookingIds.size).toBe(0);
  });
});

describe("switchMode", () => {
  it("resets both selection sets but keeps the class-type filter", () => {
    let state = createInitialState();
    state = toggleSession(state, futureSession("s1"), ctx());
    state = toggleBooking(state, "b1");
    state = setClassTypeFilter(state, "Reformer pilates");

    const switched = switchMode(state, "cancel");
    expect(switched.mode).toBe("cancel");
    expect(switched.selectedSessionIds.size).toBe(0);
    expect(switched.selectedBookingIds.size).toBe(0);
    expect(switched.classTypeFilter).toBe("Reformer pilates");
  });
});

describe("setClassTypeFilter", () => {
  it("changes the filter without destroying selections in either set", () => {
    let state = createInitialState();
    state = toggleSession(state, futureSession("s1"), ctx());
    state = toggleBooking(state, "b1");

    const filtered = setClassTypeFilter(state, "Energy pilates");
    expect(filtered.classTypeFilter).toBe("Energy pilates");
    expect([...filtered.selectedSessionIds]).toEqual(["s1"]);
    expect([...filtered.selectedBookingIds]).toEqual(["b1"]);

    // Back to "all" keeps them too.
    const all = setClassTypeFilter(filtered, "");
    expect([...all.selectedSessionIds]).toEqual(["s1"]);
    expect([...all.selectedBookingIds]).toEqual(["b1"]);
  });
});

describe("clearActiveSelection", () => {
  it("clears only the set belonging to the current mode (toolbar Poništi)", () => {
    let state = createInitialState();
    state = toggleSession(state, futureSession("s1"), ctx());
    // Force a booking selection into the same state to prove the other
    // set is untouched (in practice mode switches keep them exclusive).
    state = toggleBooking(state, "b1");

    const clearedReserve = clearActiveSelection(state);
    expect(clearedReserve.selectedSessionIds.size).toBe(0);
    expect([...clearedReserve.selectedBookingIds]).toEqual(["b1"]);

    let cancelState = switchMode(state, "cancel");
    cancelState = toggleBooking(cancelState, "b2");
    const clearedCancel = clearActiveSelection(cancelState);
    expect(clearedCancel.selectedBookingIds.size).toBe(0);
  });
});

describe("resetSelections", () => {
  it("clears both sets (used when the bound client is cleared)", () => {
    let state = createInitialState();
    state = toggleSession(state, futureSession("s1"), ctx());
    state = toggleBooking(state, "b1");

    const reset = resetSelections(state);
    expect(reset.selectedSessionIds.size).toBe(0);
    expect(reset.selectedBookingIds.size).toBe(0);
    // Mode and filter are untouched — clearing the client doesn't move you
    // off the screen state you were in.
    expect(reset.mode).toBe("reserve");
  });
});

describe("applyPattern", () => {
  // Weekly Mon 07:00 over 2 weeks, starting at the anchor Monday.
  const weeklyMonAt7 = {
    rhythm: "weekly" as const,
    weekA: { weekdays: [0], timeOfDayMins: 7 * 60 },
    weekB: { weekdays: [], timeOfDayMins: 0 },
    weeks: 2,
    rangeStart: ANCHOR,
  };

  it("merges matches into the existing selection set and skips the client's already-booked sessions", () => {
    const sessions: SelectableSession[] = [
      futureSession("mon1", { startsAt: ANCHOR.hour(7).toDate() }),
      futureSession("mon2", { startsAt: ANCHOR.add(7, "day").hour(7).toDate() }),
      futureSession("tue-noise", { startsAt: ANCHOR.add(1, "day").hour(7).toDate() }),
    ];
    let state = createInitialState();
    state = toggleSession(state, futureSession("tapped"), ctx());

    const next = applyPattern(state, sessions, weeklyMonAt7, ctx(["mon2"]));
    // Tap selection survives; mon1 matched; mon2 skipped (already booked);
    // Tuesday never matched.
    expect([...next.selectedSessionIds].sort()).toEqual(["mon1", "tapped"]);
  });

  it("selects full sessions matched by the pattern (shipped behavior — no conflict classification, unlike tap selection which blocks full)", () => {
    // Characterization: CONTEXT.md describes a conflict highlight for
    // pattern hits on full sessions, but the shipped component only skips
    // already-booked ids when merging — full matches land in the selection.
    // Preserving that here; changing it is product work, not refactoring.
    const sessions: SelectableSession[] = [
      futureSession("mon-full", {
        startsAt: ANCHOR.hour(7).toDate(),
        availableSlots: 0,
      }),
    ];
    const next = applyPattern(createInitialState(), sessions, weeklyMonAt7, ctx());
    expect([...next.selectedSessionIds]).toEqual(["mon-full"]);
  });

  it("never matches past sessions (expandPattern drops them)", () => {
    const sessions: SelectableSession[] = [
      futureSession("past-mon", {
        startsAt: ANCHOR.subtract(7, "day").hour(7).toDate(),
      }),
    ];
    const next = applyPattern(
      createInitialState(),
      sessions,
      { ...weeklyMonAt7, rangeStart: ANCHOR.subtract(14, "day"), weeks: 4 },
      ctx(),
    );
    expect(next.selectedSessionIds.size).toBe(0);
  });
});

describe("classifySession", () => {
  it("classifies an available future session as selectable", () => {
    expect(classifySession(futureSession("s1"), ctx())).toEqual({
      isPast: false,
      isFull: false,
      isAlreadyBooked: false,
      selectable: true,
    });
  });

  it("flags past, full and already-booked sessions as unselectable", () => {
    const past = classifySession(
      futureSession("p", { startsAt: ANCHOR.subtract(1, "hour").toDate() }),
      ctx(),
    );
    expect(past).toMatchObject({ isPast: true, selectable: false });

    const full = classifySession(futureSession("f", { availableSlots: 0 }), ctx());
    expect(full).toMatchObject({ isFull: true, selectable: false });

    const booked = classifySession(futureSession("b"), ctx(["b"]));
    expect(booked).toMatchObject({ isAlreadyBooked: true, selectable: false });
  });

  it("agrees with toggleSession: unselectable sessions never enter the set", () => {
    const cases = [
      futureSession("p", { startsAt: ANCHOR.subtract(1, "day").toDate() }),
      futureSession("f", { availableSlots: 0 }),
      futureSession("b"),
    ];
    const c = ctx(["b"]);
    for (const s of cases) {
      expect(classifySession(s, c).selectable).toBe(false);
      expect(toggleSession(createInitialState(), s, c).selectedSessionIds.size).toBe(0);
    }
  });
});

describe("distinctClassTypeNames", () => {
  it("dedupes and sorts the names feeding the filter chips", () => {
    expect(
      distinctClassTypeNames(["Reformer pilates", "Energy pilates", "Reformer pilates"]),
    ).toEqual(["Energy pilates", "Reformer pilates"]);
  });
});
