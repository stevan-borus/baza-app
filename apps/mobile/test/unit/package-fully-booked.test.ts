import { describe, expect, it } from "vitest";
import { isFullyBookedActivePackage } from "@/lib/package-fully-booked";

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
