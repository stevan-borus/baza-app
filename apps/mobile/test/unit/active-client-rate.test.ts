import { describe, expect, it } from "vitest";
import { activeClientRate } from "@/lib/format";

describe("activeClientRate", () => {
  it("returns the rounded percentage of active clients in the directory", () => {
    expect(activeClientRate(3, 4)).toBe(75);
    expect(activeClientRate(1, 3)).toBe(33);
    expect(activeClientRate(4, 4)).toBe(100);
  });

  it("returns undefined when there are no clients (no directory to rate)", () => {
    // This is the NaN bug: 0/0 previously rendered "NaN%". With no clients
    // there is no rate to report, so the stat should fall back to the "—"
    // placeholder — the caller renders undefined as an em-dash.
    expect(activeClientRate(0, 0)).toBeUndefined();
  });

  it("returns undefined for a missing/negative denominator rather than Infinity", () => {
    expect(activeClientRate(5, 0)).toBeUndefined();
    expect(activeClientRate(1, -1)).toBeUndefined();
  });

  it("clamps to 0 when the active count is zero", () => {
    expect(activeClientRate(0, 5)).toBe(0);
  });
});
