import { describe, expect, it } from "vitest";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";

const LATE_CANCEL_HOURS = 12;
const sessionStart = new Date("2026-06-15T18:00:00Z");

describe("shouldApplyLateCancelPenalty", () => {
  it("returns false when canceled before the late-cancel cutoff", () => {
    const canceledAt = new Date("2026-06-15T05:59:59Z");
    expect(
      shouldApplyLateCancelPenalty(sessionStart, canceledAt, LATE_CANCEL_HOURS),
    ).toBe(false);
  });

  it("returns true when canceled exactly at the late-cancel cutoff (boundary inclusive)", () => {
    const canceledAt = new Date("2026-06-15T06:00:00Z");
    expect(
      shouldApplyLateCancelPenalty(sessionStart, canceledAt, LATE_CANCEL_HOURS),
    ).toBe(true);
  });

  it("returns true when canceled between the cutoff and session start", () => {
    const canceledAt = new Date("2026-06-15T12:00:00Z");
    expect(
      shouldApplyLateCancelPenalty(sessionStart, canceledAt, LATE_CANCEL_HOURS),
    ).toBe(true);
  });

  it("returns false when canceled exactly at session start (no penalty post-start)", () => {
    const canceledAt = new Date("2026-06-15T18:00:00Z");
    expect(
      shouldApplyLateCancelPenalty(sessionStart, canceledAt, LATE_CANCEL_HOURS),
    ).toBe(false);
  });

  // Belgrade DST forward jump: Sun 2026-03-29 02:00 local → 03:00 local.
  // Session starts at 14:00 CEST = 12:00 UTC. The 12h cutoff (UTC-millisecond
  // based) lands at 00:00 UTC, regardless of the wall-clock gap hour.
  describe("DST forward jump (Belgrade, 2026-03-29)", () => {
    const dstSessionStart = new Date("2026-03-29T12:00:00Z");

    it("computes the cutoff via elapsed UTC time, not local wall-clock", () => {
      const oneSecondBeforeCutoff = new Date("2026-03-28T23:59:59Z");
      const exactlyAtCutoff = new Date("2026-03-29T00:00:00Z");
      expect(
        shouldApplyLateCancelPenalty(dstSessionStart, oneSecondBeforeCutoff, LATE_CANCEL_HOURS),
      ).toBe(false);
      expect(
        shouldApplyLateCancelPenalty(dstSessionStart, exactlyAtCutoff, LATE_CANCEL_HOURS),
      ).toBe(true);
    });
  });
});
