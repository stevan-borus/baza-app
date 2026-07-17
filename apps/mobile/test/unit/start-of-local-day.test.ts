import { describe, expect, it } from "vitest";
import { startOfLocalDay } from "@/lib/dates";

describe("startOfLocalDay", () => {
  it("zeroes the time-of-day while keeping the local calendar date", () => {
    // The admin picks "July 20" at 14:51 — the package must cover the WHOLE
    // day, including the 06:30 morning class.
    const picked = new Date(2026, 6, 20, 14, 51, 33, 456);
    const result = startOfLocalDay(picked);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("is idempotent on a midnight input", () => {
    const midnight = new Date(2026, 6, 20, 0, 0, 0, 0);
    expect(startOfLocalDay(midnight).getTime()).toBe(midnight.getTime());
  });

  it("does not mutate the input date", () => {
    const picked = new Date(2026, 6, 20, 14, 51);
    const before = picked.getTime();
    startOfLocalDay(picked);
    expect(picked.getTime()).toBe(before);
  });
});
