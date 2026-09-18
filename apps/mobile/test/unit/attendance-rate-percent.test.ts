import { describe, expect, it } from "vitest";
import { attendanceRatePercent } from "@/lib/server/report-aggregation";

/**
 * The dashboard's "Stopa dolazaka" tile used to divide clients by clients —
 * an all-time directory ratio with nothing to do with attendance. It now
 * divides kept reservations by all reservations on sessions that already
 * started, and this helper is the arithmetic seam for that.
 */
describe("attendanceRatePercent", () => {
  it("returns the rounded percentage of kept reservations", () => {
    expect(attendanceRatePercent(3, 1)).toBe(75);
    expect(attendanceRatePercent(1, 2)).toBe(33);
    expect(attendanceRatePercent(4, 0)).toBe(100);
  });

  it("returns null when nothing was reserved (no rate to report)", () => {
    expect(attendanceRatePercent(0, 0)).toBeNull();
  });

  it("returns 0 when every reservation was cancelled", () => {
    expect(attendanceRatePercent(0, 5)).toBe(0);
  });

  it("returns null rather than a negative rate for impossible counts", () => {
    expect(attendanceRatePercent(-1, 0)).toBeNull();
    expect(attendanceRatePercent(1, -2)).toBeNull();
  });
});
