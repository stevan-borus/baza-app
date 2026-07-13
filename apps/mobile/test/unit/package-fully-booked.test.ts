import { describe, expect, it } from "vitest";
import {
  isFullyBookedActivePackage,
  packageCreditsRemainingFraction,
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

describe("packageCreditsRemainingFraction", () => {
  it("is FULL for a fully-booked but active package (the '0 / 12' bug)", () => {
    // bookable is 0, but all 12 credits still remain until attended — the bar
    // must be full, not the empty nub the profile row used to show.
    expect(packageCreditsRemainingFraction(12, 12)).toBe(1);
  });

  it("tracks remaining credits, not bookable count", () => {
    // 8 credits left of 12 → 2/3 full, regardless of how many are held/bookable.
    expect(packageCreditsRemainingFraction(8, 12)).toBeCloseTo(8 / 12);
  });

  it("is empty when all credits are consumed", () => {
    expect(packageCreditsRemainingFraction(0, 12)).toBe(0);
  });

  it("returns 0 for a zero/absent session count (no divide-by-zero)", () => {
    expect(packageCreditsRemainingFraction(5, 0)).toBe(0);
  });

  it("clamps out-of-range credits into 0..1", () => {
    expect(packageCreditsRemainingFraction(-3, 12)).toBe(0);
    expect(packageCreditsRemainingFraction(15, 12)).toBe(1);
  });
});
