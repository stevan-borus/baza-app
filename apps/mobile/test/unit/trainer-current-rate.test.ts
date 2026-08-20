import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentTrainerRate,
  effectiveTrainerPercentFor,
  hasLiveOverride,
  trainerRateHistory,
} from "@/lib/trainer-rate-selection";

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

/**
 * Per-class-type overrides. A trainer's cut differs by what they teach — an
 * individual costs the client far more than a group slot, so the studio pays a
 * different percentage on it. The override is another append-only row, scoped
 * to one class type; a row with a NULL percent is a tombstone that ends the
 * override and hands that class type back to the default rate.
 */
describe("scoped rate selection", () => {
  const SCOPED = [
    // Default scope: the pre-existing shape, no classTypeId at all.
    { id: "d1", trainerUserId: "t1", percent: 40, effectiveFrom: "2026-01-01T05:00:00.000Z", note: null },
    // Individual override.
    { id: "i1", trainerUserId: "t1", percent: 60, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    // Another trainer's override on the same class type.
    { id: "x1", trainerUserId: "t2", percent: 75, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
  ];

  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("keeps currentTrainerRate on the default scope, ignoring overrides", () => {
    expect(currentTrainerRate(SCOPED, "t1")?.id).toBe("d1");
  });

  it("returns the override when asked for that class type", () => {
    expect(currentTrainerRate(SCOPED, "t1", "ct-individual")?.percent).toBe(60);
  });

  it("returns nothing for a class type that has no override of its own", () => {
    expect(currentTrainerRate(SCOPED, "t1", "ct-group")).toBeUndefined();
  });

  it("scopes the history too, so an override list never shows default rows", () => {
    expect(trainerRateHistory(SCOPED, "t1", "ct-individual").map((r) => r.id)).toEqual(["i1"]);
    expect(trainerRateHistory(SCOPED, "t1").map((r) => r.id)).toEqual(["d1"]);
  });
});

describe("effectiveTrainerPercentFor", () => {
  const AT = new Date("2026-08-01T03:00:00.000Z");

  const RATES = [
    { id: "d1", trainerUserId: "t1", percent: 40, effectiveFrom: "2026-01-01T05:00:00.000Z", note: null },
    { id: "i1", trainerUserId: "t1", percent: 60, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
  ];

  it("uses the override for its own class type", () => {
    expect(effectiveTrainerPercentFor(RATES, "t1", "ct-individual", AT)).toBe(60);
  });

  it("falls back to the default rate for every other class type", () => {
    expect(effectiveTrainerPercentFor(RATES, "t1", "ct-group", AT)).toBe(40);
  });

  it("resolves the default scope itself", () => {
    expect(effectiveTrainerPercentFor(RATES, "t1", null, AT)).toBe(40);
  });

  it("returns null when the trainer has no rate at all", () => {
    expect(effectiveTrainerPercentFor(RATES, "t9", "ct-group", AT)).toBeNull();
  });

  it("reverts a class type to the default rate at a tombstone", () => {
    // Null percent = "from here on, this class type is paid the default".
    const withTombstone = [
      ...RATES,
      { id: "i2", trainerUserId: "t1", percent: null, effectiveFrom: "2026-07-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(effectiveTrainerPercentFor(withTombstone, "t1", "ct-individual", AT)).toBe(40);
  });

  it("still honours the override BEFORE its tombstone takes effect", () => {
    const withTombstone = [
      ...RATES,
      { id: "i2", trainerUserId: "t1", percent: null, effectiveFrom: "2026-07-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    // June: the tombstone has not started yet.
    expect(
      effectiveTrainerPercentFor(withTombstone, "t1", "ct-individual", new Date("2026-06-01T03:00:00.000Z")),
    ).toBe(60);
  });

  it("ignores an override scheduled to start after the instant asked about", () => {
    const scheduled = [
      ...RATES,
      { id: "i3", trainerUserId: "t1", percent: 70, effectiveFrom: "2026-09-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(effectiveTrainerPercentFor(scheduled, "t1", "ct-individual", AT)).toBe(60);
  });

  it("takes the LAST override entered when several share one effective date", () => {
    // A same-day typo correction on an override, same trap as the default
    // scope: only `seq` separates rows that start at the same studio boundary.
    const sameDay = [
      { id: "a", trainerUserId: "t1", percent: 50, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual", createdAt: "2026-02-01T10:00:00.000Z", seq: 1 },
      { id: "b", trainerUserId: "t1", percent: 65, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual", createdAt: "2026-02-01T10:00:00.000Z", seq: 2 },
    ];
    expect(effectiveTrainerPercentFor(sameDay, "t1", "ct-individual", AT)).toBe(65);
  });

  it("applies an override even when the trainer has no default rate", () => {
    // Onboarding order: an admin can agree the individual percentage before
    // the general one. That class type must pay, and only that one.
    const overrideOnly = [
      { id: "i1", trainerUserId: "t1", percent: 60, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(effectiveTrainerPercentFor(overrideOnly, "t1", "ct-individual", AT)).toBe(60);
    expect(effectiveTrainerPercentFor(overrideOnly, "t1", "ct-group", AT)).toBeNull();
  });

  it("keeps another trainer's override out of this trainer's resolution", () => {
    const twoTrainers = [
      ...RATES,
      { id: "x1", trainerUserId: "t2", percent: 90, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(effectiveTrainerPercentFor(twoTrainers, "t1", "ct-individual", AT)).toBe(60);
  });

  it("reports an override that happens to match the default as still overridden", () => {
    // Merging on equal percentages would hide a rate the admin can see on the
    // trainer's screen, and it would silently un-merge the month the default
    // moved. The scope is the fact; the number is not.
    const sameNumber = [
      { id: "d1", trainerUserId: "t1", percent: 40, effectiveFrom: "2026-01-01T05:00:00.000Z", note: null },
      { id: "i1", trainerUserId: "t1", percent: 40, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(hasLiveOverride(sameNumber, "t1", "ct-individual", AT)).toBe(true);
  });

  it("stops reporting an override once it is tombstoned", () => {
    const tombstoned = [
      ...RATES,
      { id: "i2", trainerUserId: "t1", percent: null, effectiveFrom: "2026-07-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(hasLiveOverride(tombstoned, "t1", "ct-individual", AT)).toBe(false);
    expect(hasLiveOverride(RATES, "t1", "ct-individual", AT)).toBe(true);
    expect(hasLiveOverride(RATES, "t1", "ct-group", AT)).toBe(false);
  });

  it("returns null when a tombstoned class type has no default to fall back to", () => {
    const noDefault = [
      { id: "i1", trainerUserId: "t1", percent: 60, effectiveFrom: "2026-02-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
      { id: "i2", trainerUserId: "t1", percent: null, effectiveFrom: "2026-07-01T05:00:00.000Z", note: null, classTypeId: "ct-individual" },
    ];
    expect(effectiveTrainerPercentFor(noDefault, "t1", "ct-individual", AT)).toBeNull();
  });
});
