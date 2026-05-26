/**
 * Unit tests for the reservation-pattern expansion.
 *
 * The biweekly case is the load-bearing one: Week A on even week-offsets
 * from rangeStart, Week B on odd, no week-offset toggle. Anchor matters —
 * we always pin tests to a known Monday.
 *
 * expandPattern also drops sessions that are in the past relative to
 * `lib/now.ts:nowMs()`, which honours TEST_ANCHOR_TIME per-call. We set
 * the env var in a beforeAll so the helper resolves "now" to ANCHOR —
 * otherwise every test session would be filtered as past on wall-clock.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { expandPattern, type SessionForPattern } from "@/lib/reservation-pattern";

// Anchor on a Monday so weekday math is unambiguous.
const ANCHOR = dayjs("2026-05-11T00:00:00"); // Monday

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

function session(id: string, daysFromAnchor: number, hour: number, minute = 0): SessionForPattern {
  return {
    id,
    startsAt: ANCHOR.add(daysFromAnchor, "day").hour(hour).minute(minute).second(0).millisecond(0).toDate(),
  };
}

describe("expandPattern — weekly rhythm", () => {
  it("matches every weekday × time hit inside the window", () => {
    // Mon, Wed, Fri at 07:00 across 2 weeks. Anchor is Monday May 11.
    const sessions: SessionForPattern[] = [
      session("mon1", 0, 7), // Mon week 0
      session("wed1", 2, 7), // Wed week 0
      session("fri1", 4, 7), // Fri week 0
      session("mon2", 7, 7), // Mon week 1
      session("wed2", 9, 7), // Wed week 1
      session("fri2", 11, 7), // Fri week 1
      session("noise-tue", 1, 7), // Tue — wrong weekday
      session("noise-mon-8", 0, 8), // Mon but 08:00 — wrong time
    ];
    const result = expandPattern(sessions, {
      rhythm: "weekly",
      weekA: { weekdays: [0, 2, 4], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [], timeOfDayMins: 0 },
      weeks: 2,
      rangeStart: ANCHOR,
    });
    expect([...result].sort()).toEqual(["fri1", "fri2", "mon1", "mon2", "wed1", "wed2"]);
  });

  it("ignores sessions outside the date range", () => {
    const sessions: SessionForPattern[] = [
      session("inside", 3, 7), // inside week 0
      session("outside", 21, 7), // 3 weeks out — beyond a 2-week range
      session("before", -1, 7), // before rangeStart
    ];
    const result = expandPattern(sessions, {
      rhythm: "weekly",
      weekA: { weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [], timeOfDayMins: 0 },
      weeks: 2,
      rangeStart: ANCHOR,
    });
    expect([...result]).toEqual(["inside"]);
  });
});

describe("expandPattern — biweekly rhythm", () => {
  it("uses Week A on even week-offsets and Week B on odd", () => {
    // Week A: Mon/Wed/Fri at 07:00
    // Week B: Tue/Thu at 17:00
    // Anchor week (Mon May 11–Sun May 17) is week-offset 0 (A).
    // Following week (Mon May 18–Sun May 24) is week-offset 1 (B).
    const sessions: SessionForPattern[] = [
      session("A-mon", 0, 7), // week 0 Mon 07:00 — match A
      session("A-wed", 2, 7), // week 0 Wed 07:00 — match A
      session("A-tue-wrong", 1, 17), // week 0 Tue 17:00 — Week B pattern, but on Week A day → NO match
      session("B-tue", 8, 17), // week 1 Tue 17:00 — match B
      session("B-thu", 10, 17), // week 1 Thu 17:00 — match B
      session("B-mon-wrong", 7, 7), // week 1 Mon 07:00 — Week A pattern on Week B day → NO match
    ];
    const result = expandPattern(sessions, {
      rhythm: "biweekly",
      weekA: { weekdays: [0, 2, 4], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [1, 3], timeOfDayMins: 17 * 60 },
      weeks: 2,
      rangeStart: ANCHOR,
    });
    expect([...result].sort()).toEqual(["A-mon", "A-wed", "B-thu", "B-tue"]);
  });

  it("anchors Week A to the rangeStart week, not the calendar", () => {
    // If we move rangeStart to the *following* Monday (May 18), then week 0 is
    // the May-18 week. Sessions in the May 11 week are *before* rangeStart and
    // should be skipped entirely.
    const sessions: SessionForPattern[] = [
      session("before-1", 0, 7), // May 11 Mon — before new rangeStart
      session("after-A-mon", 7, 7), // May 18 Mon — new week 0, matches A
      session("after-B-tue", 15, 17), // May 26 Tue — new week 1, matches B
    ];
    const result = expandPattern(sessions, {
      rhythm: "biweekly",
      weekA: { weekdays: [0], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [1], timeOfDayMins: 17 * 60 },
      weeks: 4,
      rangeStart: ANCHOR.add(7, "day"), // shift one week later
    });
    expect([...result].sort()).toEqual(["after-A-mon", "after-B-tue"]);
  });

  it("alternates A/B/A/B across a longer range", () => {
    // 6 weeks of Mondays. Pattern matches A on Mon only (week-offset 0, 2, 4),
    // and Week B has no Monday at any time, so no Mon should match B.
    const sessions: SessionForPattern[] = [
      session("w0-mon", 0, 7), // week 0 → A
      session("w1-mon", 7, 7), // week 1 → B (no Mon in Week B → skip)
      session("w2-mon", 14, 7), // week 2 → A
      session("w3-mon", 21, 7), // week 3 → B → skip
      session("w4-mon", 28, 7), // week 4 → A
      session("w5-mon", 35, 7), // week 5 → B → skip
    ];
    const result = expandPattern(sessions, {
      rhythm: "biweekly",
      weekA: { weekdays: [0], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [1, 3], timeOfDayMins: 17 * 60 },
      weeks: 6,
      rangeStart: ANCHOR,
    });
    expect([...result].sort()).toEqual(["w0-mon", "w2-mon", "w4-mon"]);
  });
});

describe("expandPattern — past-session filter", () => {
  it("drops sessions whose startsAt is before nowMs()", () => {
    // "Now" is pinned to ANCHOR (Mon 2026-05-11 00:00 local). A session at
    // 2026-05-10 (the day before) is in the past even though its weekday
    // and time both match — it must be filtered out.
    const sessions: SessionForPattern[] = [
      // Past session — same weekday + time but before "now"
      {
        id: "past-mon",
        startsAt: ANCHOR.subtract(7, "day")
          .hour(7)
          .minute(0)
          .second(0)
          .millisecond(0)
          .toDate(),
      },
      // Future session — should match
      session("future-mon", 7, 7),
    ];
    const result = expandPattern(sessions, {
      rhythm: "weekly",
      weekA: { weekdays: [0], timeOfDayMins: 7 * 60 },
      weekB: { weekdays: [], timeOfDayMins: 0 },
      weeks: 4,
      rangeStart: ANCHOR.subtract(14, "day"), // wide range so past would match
    });
    expect([...result]).toEqual(["future-mon"]);
  });
});
