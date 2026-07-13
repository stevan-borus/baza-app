import { describe, expect, it } from "vitest";
import { isInLateCancelWindow } from "@/lib/late-cancel";

const LATE_CANCEL_HOURS = 12;
const sessionStartMs = Date.parse("2026-06-15T18:00:00Z");

const hoursFromStart = (h: number) => sessionStartMs + h * 60 * 60 * 1000;

describe("isInLateCancelWindow", () => {
  it("returns false once the session has started (no forfeit post-start)", () => {
    // Mirrors the server's `canceledAt < sessionStartsAt` half: the server
    // never applies the penalty after start, so the sheet must not warn.
    expect(
      isInLateCancelWindow(sessionStartMs, hoursFromStart(1), LATE_CANCEL_HOURS),
    ).toBe(false);
  });

  it("returns false exactly at session start (start boundary exclusive)", () => {
    expect(
      isInLateCancelWindow(sessionStartMs, hoursFromStart(0), LATE_CANCEL_HOURS),
    ).toBe(false);
  });

  it("returns true between the cutoff and session start", () => {
    expect(
      isInLateCancelWindow(sessionStartMs, hoursFromStart(-6), LATE_CANCEL_HOURS),
    ).toBe(true);
  });

  it("returns true exactly at the cutoff (cutoff boundary inclusive, like the server)", () => {
    expect(
      isInLateCancelWindow(
        sessionStartMs,
        hoursFromStart(-LATE_CANCEL_HOURS),
        LATE_CANCEL_HOURS,
      ),
    ).toBe(true);
  });

  it("returns false before the cutoff (early cancel, no penalty)", () => {
    expect(
      isInLateCancelWindow(
        sessionStartMs,
        hoursFromStart(-LATE_CANCEL_HOURS) - 1,
        LATE_CANCEL_HOURS,
      ),
    ).toBe(false);
  });
});
