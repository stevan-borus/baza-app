import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentTrainerRate, trainerRateHistory } from "@/lib/trainer-rate-selection";

/**
 * Choosing which of a trainer's rate rows is "the current one".
 *
 * Rates are append-only history, so the list screen has to pick the newest row
 * that has already taken effect — a rate scheduled for next month must not
 * display as today's percentage.
 */

const RATES = [
  { id: "r1", trainerUserId: "t1", percent: 30, effectiveFrom: "2025-01-01T05:00:00.000Z", note: null },
  { id: "r2", trainerUserId: "t1", percent: 40, effectiveFrom: "2026-03-01T05:00:00.000Z", note: null },
  { id: "r3", trainerUserId: "t1", percent: 55, effectiveFrom: "2026-12-01T05:00:00.000Z", note: "future" },
  { id: "r4", trainerUserId: "t2", percent: 50, effectiveFrom: "2026-01-01T05:00:00.000Z", note: null },
];

describe("currentTrainerRate", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("takes the newest rate that has already taken effect", () => {
    expect(currentTrainerRate(RATES, "t1")?.percent).toBe(40);
  });

  it("ignores a rate scheduled to start in the future", () => {
    // r3 (55%) starts in December; today is August.
    expect(currentTrainerRate(RATES, "t1")?.id).toBe("r2");
  });

  it("keeps trainers separate", () => {
    expect(currentTrainerRate(RATES, "t2")?.percent).toBe(50);
  });

  it("returns undefined when a trainer has no rate at all", () => {
    expect(currentTrainerRate(RATES, "unknown")).toBeUndefined();
  });

  it("returns undefined when every rate is still in the future", () => {
    const futureOnly = [
      { id: "f1", trainerUserId: "t9", percent: 42, effectiveFrom: "2027-01-01T05:00:00.000Z", note: null },
    ];
    expect(currentTrainerRate(futureOnly, "t9")).toBeUndefined();
  });
});

describe("trainerRateHistory", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("lists a trainer's rates newest-first, including scheduled ones", () => {
    // The future rate belongs in the history list — the admin needs to see a
    // raise they already scheduled, even though it is not today's rate.
    expect(trainerRateHistory(RATES, "t1").map((r) => r.id)).toEqual([
      "r3",
      "r2",
      "r1",
    ]);
  });

  it("excludes other trainers", () => {
    expect(trainerRateHistory(RATES, "t2").map((r) => r.id)).toEqual(["r4"]);
  });
});

/**
 * Same-day corrections. An admin who sets 20%, notices a typo and sets 30%
 * produces several rows sharing ONE effectiveFrom (rates start at the studio
 * day boundary, so every rate set today is the same instant). Ordering by
 * effectiveFrom alone leaves those tied, and the winner is then whatever order
 * the array happened to arrive in — so the screen kept showing the FIRST
 * percentage entered and the payout used an arbitrary one.
 */
describe("several rates on the same day", () => {
  const SAME_DAY = [
    // Same createdAt on purpose: Postgres now() is transaction time, so rows
    // written together really do tie there. Only `seq` separates them.
    { id: "a", trainerUserId: "t1", percent: 20, effectiveFrom: "2026-08-11T05:00:00.000Z", note: null, createdAt: "2026-08-11T10:00:00.000Z", seq: 1 },
    { id: "b", trainerUserId: "t1", percent: 0, effectiveFrom: "2026-08-11T05:00:00.000Z", note: null, createdAt: "2026-08-11T10:00:00.000Z", seq: 2 },
    { id: "c", trainerUserId: "t1", percent: 30, effectiveFrom: "2026-08-11T05:00:00.000Z", note: null, createdAt: "2026-08-11T10:00:00.000Z", seq: 3 },
  ];

  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-11T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("takes the one entered LAST, not the one entered first", () => {
    expect(currentTrainerRate(SAME_DAY, "t1")?.percent).toBe(30);
  });

  it("does not depend on the order the rows arrive in", () => {
    const reversed = [...SAME_DAY].reverse();
    expect(currentTrainerRate(reversed, "t1")?.percent).toBe(30);
  });

  it("orders the history by entry time within the same day", () => {
    expect(trainerRateHistory(SAME_DAY, "t1").map((r) => r.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});
