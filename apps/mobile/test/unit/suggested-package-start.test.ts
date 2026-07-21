import { describe, expect, it } from "vitest";
import { suggestedPackageStart } from "@/lib/suggested-package-start";

// What the assign/payment date picker should open on. A client who renews
// at their LAST session shouldn't get a package that starts mid-way through
// the one they're still using — the natural default is "the day after the
// current one runs out". Everyone else starts today.
describe("suggestedPackageStart", () => {
  const at = new Date("2026-07-21T12:00:00.000Z");

  it("suggests today when the client has no packages at all", () => {
    const suggestion = suggestedPackageStart([], at);
    expect(suggestion.toISOString()).toBe("2026-07-21T03:00:00.000Z");
  });

  it("suggests the day after the current package expires", () => {
    // Live pack running through 23 July -> the renewal opens on the 24th,
    // so the two never overlap and no day is lost between them.
    const packages = [
      { expiresAt: "2026-07-23T21:59:59.999Z", sessionsRemaining: 2 },
    ];
    const suggestion = suggestedPackageStart(packages, at);
    expect(suggestion.toISOString()).toBe("2026-07-24T03:00:00.000Z");
  });

  it("suggests today when every package has already lapsed", () => {
    // A lapsed client is starting fresh, not queueing behind anything.
    const packages = [
      { expiresAt: "2026-07-10T21:59:59.999Z", sessionsRemaining: 3 },
    ];
    const suggestion = suggestedPackageStart(packages, at);
    expect(suggestion.toISOString()).toBe("2026-07-21T03:00:00.000Z");
  });

  it("queues behind the LATEST expiry when several packages are stacked", () => {
    // Stacking is supported (two cycles paid up front). A third package
    // must land after the last one ends, not after the first.
    const packages = [
      { expiresAt: "2026-07-23T21:59:59.999Z", sessionsRemaining: 1 },
      { expiresAt: "2026-08-22T21:59:59.999Z", sessionsRemaining: 8 },
    ];
    const suggestion = suggestedPackageStart(packages, at);
    expect(suggestion.toISOString()).toBe("2026-08-23T03:00:00.000Z");
  });

  it("ignores a used-up package that has not date-expired", () => {
    // Zero sessions left means they need a new pack NOW — queueing behind
    // its unused validity would lock them out for no reason.
    const packages = [
      { expiresAt: "2026-08-22T21:59:59.999Z", sessionsRemaining: 0 },
    ];
    const suggestion = suggestedPackageStart(packages, at);
    expect(suggestion.toISOString()).toBe("2026-07-21T03:00:00.000Z");
  });

  it("always lands on a studio day start, never the current time of day", () => {
    // The picker is date-only; the value behind it must already be
    // normalized so submitting without touching it can't store 14:51.
    const suggestion = suggestedPackageStart([], at);
    expect(suggestion.getUTCMinutes()).toBe(0);
    expect(suggestion.getUTCSeconds()).toBe(0);
    expect(suggestion.getUTCMilliseconds()).toBe(0);
  });
});
