import { describe, expect, it } from "vitest";
import {
  isFullyBookedActivePackage,
  packageUsedFraction,
} from "@/lib/package-fully-booked";

describe("isFullyBookedActivePackage", () => {
  it("returns true when bookable is 0 but raw credits remain (active, fully reserved)", () => {
    // The "0 / 12" state: every credit is held by a future booking, so nothing
    // is bookable, yet sessionsRemaining is still 12 until those are attended.
    expect(isFullyBookedActivePackage(0, 12)).toBe(true);
  });

  it("returns false when there is still something bookable", () => {
    expect(isFullyBookedActivePackage(3, 12)).toBe(false);
  });

  it("returns false when the package is lapsed (no raw credits — the renewal case)", () => {
    // sessionsRemaining === 0 is the lapsed case; it routes to RenewalCard and
    // must NOT get the fully-booked hint.
    expect(isFullyBookedActivePackage(0, 0)).toBe(false);
  });
});

describe("packageUsedFraction", () => {
  it("is FULL when bookable is 0 (every session booked/consumed)", () => {
    // Usage bar fills up: nothing left to book means the whole package is used,
    // so the bar is full.
    expect(packageUsedFraction(0, 12)).toBe(1);
  });

  it("is EMPTY for a fresh, untouched package (bookable === total)", () => {
    // No sessions booked yet → nothing used → empty bar.
    expect(packageUsedFraction(12, 12)).toBe(0);
  });

  it("tracks usage: 4 of 12 booked → 1/3 full", () => {
    // bookable 8 of 12 → 4 used → 4/12.
    expect(packageUsedFraction(8, 12)).toBeCloseTo(4 / 12);
  });

  it("returns 0 for a zero/absent session count (no divide-by-zero)", () => {
    expect(packageUsedFraction(5, 0)).toBe(0);
  });

  it("clamps out-of-range usage into 0..1", () => {
    // bookable > total → negative used → clamp to empty.
    expect(packageUsedFraction(15, 12)).toBe(0);
    // bookable < 0 → used > total → clamp to full.
    expect(packageUsedFraction(-3, 12)).toBe(1);
  });
});
