/**
 * Calendar-aligned period window math.
 *
 * Pinned to the moment the bug was found: utilization showed 0% on Mesec /
 * Kvartal / Godina because the old rolling-30/90/365-day windows excluded
 * future-scheduled sessions in the current calendar period. The fix moved
 * the pill to calendar-aligned windows; these tests pin that contract so
 * "let's just go back to rolling days" can't quietly land.
 */
import { describe, expect, it } from "vitest";

import { computePeriodWindow } from "@/lib/admin/use-period-pill";

describe("computePeriodWindow", () => {
  it('"all" returns undefined endpoints', () => {
    const out = computePeriodWindow("all", new Date("2026-05-12T23:06:00Z"));
    expect(out).toEqual({ from: undefined, to: undefined });
  });

  it('"month" returns the current calendar month, exclusive next-month start', () => {
    // Mid-month anchor.
    const out = computePeriodWindow(
      "month",
      new Date("2026-05-12T23:06:00Z"),
    );
    expect(out.from).toBe("2026-05-01T00:00:00.000Z");
    expect(out.to).toBe("2026-06-01T00:00:00.000Z");
  });

  it('"month" handles December → January year crossover', () => {
    const out = computePeriodWindow(
      "month",
      new Date("2026-12-15T10:00:00Z"),
    );
    expect(out.from).toBe("2026-12-01T00:00:00.000Z");
    expect(out.to).toBe("2027-01-01T00:00:00.000Z");
  });

  it('"quarter" aligns to the calendar quarter containing the anchor', () => {
    // May is in Q2 (Apr–Jun).
    const q2 = computePeriodWindow(
      "quarter",
      new Date("2026-05-12T23:06:00Z"),
    );
    expect(q2.from).toBe("2026-04-01T00:00:00.000Z");
    expect(q2.to).toBe("2026-07-01T00:00:00.000Z");
  });

  it('"quarter" boundary: Mar 31 vs Apr 1 flip from Q1 to Q2', () => {
    // Last hour of Q1 (UTC).
    const lastDayOfQ1 = computePeriodWindow(
      "quarter",
      new Date("2026-03-31T23:59:00Z"),
    );
    expect(lastDayOfQ1.from).toBe("2026-01-01T00:00:00.000Z");
    expect(lastDayOfQ1.to).toBe("2026-04-01T00:00:00.000Z");

    // First hour of Q2.
    const firstDayOfQ2 = computePeriodWindow(
      "quarter",
      new Date("2026-04-01T00:00:00Z"),
    );
    expect(firstDayOfQ2.from).toBe("2026-04-01T00:00:00.000Z");
    expect(firstDayOfQ2.to).toBe("2026-07-01T00:00:00.000Z");
  });

  it('"quarter" Q4 wraps the to-bound into next January', () => {
    const q4 = computePeriodWindow(
      "quarter",
      new Date("2026-11-15T10:00:00Z"),
    );
    expect(q4.from).toBe("2026-10-01T00:00:00.000Z");
    expect(q4.to).toBe("2027-01-01T00:00:00.000Z");
  });

  it('"year" returns the calendar year, exclusive next-year start', () => {
    const out = computePeriodWindow(
      "year",
      new Date("2026-05-12T23:06:00Z"),
    );
    expect(out.from).toBe("2026-01-01T00:00:00.000Z");
    expect(out.to).toBe("2027-01-01T00:00:00.000Z");
  });

  it("month window for early-month anchor includes the rest of the month (regression: iskorišćenost showing 0% on Mesec)", () => {
    // The original bug: at server-now 2026-05-12 23:06 UTC, the OLD rolling
    // window was [2026-04-13, 2026-05-13) — excluding SCHEDULED sessions on
    // May 13/14/15. The calendar window now includes them.
    const out = computePeriodWindow(
      "month",
      new Date("2026-05-12T23:06:00Z"),
    );
    const sessionStart = new Date("2026-05-14T16:00:00Z").getTime();
    expect(sessionStart).toBeGreaterThanOrEqual(
      new Date(out.from!).getTime(),
    );
    expect(sessionStart).toBeLessThan(new Date(out.to!).getTime());
  });
});
