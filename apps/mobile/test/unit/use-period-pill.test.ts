/**
 * Calendar-aligned period window math, on the STUDIO day boundary.
 *
 * Two contracts are pinned here, from two different bugs:
 *
 * 1. Windows are CALENDAR-aligned, not rolling. Utilization showed 0% on
 *    Mesec / Kvartal / Godina because the old rolling-30/90/365-day windows
 *    excluded future-scheduled sessions in the current calendar period.
 *
 * 2. The boundary is the studio day (05:00 Belgrade), not UTC midnight.
 *    "Mesec" used to mean a UTC calendar month here while the dashboard
 *    revenue hero meant a studio month, so a payment taken at 02:00 Belgrade
 *    on the 1st landed in a different period depending on the screen.
 *
 * The expected instants (03:00Z in summer / 04:00Z in winter) are the same
 * ones `test/unit/payroll-valuation.test.ts` pins for `studioMonthRange` —
 * that shared boundary is the whole point of this change.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computePeriodWindow } from "@/lib/admin/use-period-pill";

// The window endpoints are absolute instants, but the math reads calendar
// fields in `Europe/Belgrade`. Pin the process zone so a CET dev machine and
// a UTC CI runner agree — this repo has shipped green-locally/red-in-CI date
// tests before (see `format-date-range.test.ts`).
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe("computePeriodWindow", () => {
  it('"all" returns undefined endpoints', () => {
    const out = computePeriodWindow("all", new Date("2026-05-12T23:06:00Z"));
    expect(out).toEqual({ from: undefined, to: undefined });
  });

  it('"month" spans the studio month — 05:00 Belgrade on the 1st, exclusive next-month start', () => {
    // Mid-month anchor. May and June are both CEST (UTC+2), so 05:00
    // Belgrade is 03:00Z at both ends.
    const out = computePeriodWindow("month", new Date("2026-05-12T23:06:00Z"));
    expect(out.from).toBe("2026-05-01T03:00:00.000Z");
    expect(out.to).toBe("2026-06-01T03:00:00.000Z");
  });

  it('"month" handles December to January year crossover', () => {
    // Winter, CET (UTC+1): 05:00 Belgrade is 04:00Z.
    const out = computePeriodWindow("month", new Date("2026-12-15T10:00:00Z"));
    expect(out.from).toBe("2026-12-01T04:00:00.000Z");
    expect(out.to).toBe("2027-01-01T04:00:00.000Z");
  });

  it('"month" before opening on the 1st still reports the CLOSING month', () => {
    // 02:00 Belgrade on 1 June = 2026-06-01T00:00Z. The studio is shut; the
    // May studio day that opened on 31 May has not ended. This is the exact
    // instant the old UTC-midnight math got wrong — it flipped to June.
    const out = computePeriodWindow("month", new Date("2026-06-01T00:00:00Z"));
    expect(out.from).toBe("2026-05-01T03:00:00.000Z");
    expect(out.to).toBe("2026-06-01T03:00:00.000Z");
  });

  it('"month" at the opening instant on the 1st has rolled into the new month', () => {
    // 05:00 Belgrade on 1 June = 2026-06-01T03:00Z — the boundary itself
    // belongs to the opening month (half-open window, inclusive `from`).
    const out = computePeriodWindow("month", new Date("2026-06-01T03:00:00Z"));
    expect(out.from).toBe("2026-06-01T03:00:00.000Z");
    expect(out.to).toBe("2026-07-01T03:00:00.000Z");
  });

  it('"month" spanning the CET to CEST change stays anchored to local 05:00', () => {
    // March 2026: DST starts 29 March. The month opens in CET (04:00Z) and
    // closes in CEST (03:00Z) — so the window is one hour SHORT of a fixed
    // 31x24h, which a hard-coded offset would get wrong.
    const march = computePeriodWindow("month", new Date("2026-03-15T12:00:00Z"));
    expect(march.from).toBe("2026-03-01T04:00:00.000Z");
    expect(march.to).toBe("2026-04-01T03:00:00.000Z");
  });

  it('"quarter" aligns to the calendar quarter containing the anchor', () => {
    // May is in Q2 (Apr-Jun); both ends are CEST.
    const q2 = computePeriodWindow("quarter", new Date("2026-05-12T23:06:00Z"));
    expect(q2.from).toBe("2026-04-01T03:00:00.000Z");
    expect(q2.to).toBe("2026-07-01T03:00:00.000Z");
  });

  it('"quarter" starts on the right month for each quarter (Jan/Apr/Jul/Oct)', () => {
    expect(computePeriodWindow("quarter", new Date("2026-02-10T12:00:00Z")).from).toBe(
      "2026-01-01T04:00:00.000Z",
    );
    expect(computePeriodWindow("quarter", new Date("2026-05-10T12:00:00Z")).from).toBe(
      "2026-04-01T03:00:00.000Z",
    );
    expect(computePeriodWindow("quarter", new Date("2026-08-10T12:00:00Z")).from).toBe(
      "2026-07-01T03:00:00.000Z",
    );
    // Note 1 Oct is still CEST — DST ends 25 October — so Q4 OPENS at 03:00Z
    // and closes at 04:00Z. The offset is resolved per endpoint, not once.
    expect(computePeriodWindow("quarter", new Date("2026-11-10T12:00:00Z")).from).toBe(
      "2026-10-01T03:00:00.000Z",
    );
  });

  it('"quarter" boundary: before opening on 1 Apr is still Q1', () => {
    // 02:00 Belgrade on 1 April = 2026-04-01T00:00Z — Q1 is still closing.
    const stillQ1 = computePeriodWindow("quarter", new Date("2026-04-01T00:00:00Z"));
    expect(stillQ1.from).toBe("2026-01-01T04:00:00.000Z");
    // Q1 opens in CET (04:00Z) and closes in CEST (03:00Z) — one hour short
    // of a fixed 90x24h, which is exactly what a hard-coded offset gets wrong.
    expect(stillQ1.to).toBe("2026-04-01T03:00:00.000Z");

    // The opening instant flips to Q2.
    const q2 = computePeriodWindow("quarter", new Date("2026-04-01T03:00:00Z"));
    expect(q2.from).toBe("2026-04-01T03:00:00.000Z");
    expect(q2.to).toBe("2026-07-01T03:00:00.000Z");
  });

  it('"quarter" Q4 wraps the to-bound into next January', () => {
    const q4 = computePeriodWindow("quarter", new Date("2026-11-15T10:00:00Z"));
    expect(q4.from).toBe("2026-10-01T03:00:00.000Z");
    expect(q4.to).toBe("2027-01-01T04:00:00.000Z");
  });

  it('"year" spans the studio year, exclusive next-year start', () => {
    const out = computePeriodWindow("year", new Date("2026-05-12T23:06:00Z"));
    expect(out.from).toBe("2026-01-01T04:00:00.000Z");
    expect(out.to).toBe("2027-01-01T04:00:00.000Z");
  });

  it('"year" before opening on 1 Jan still reports the CLOSING year', () => {
    // 02:00 Belgrade on 1 Jan 2027 = 2027-01-01T01:00Z.
    const out = computePeriodWindow("year", new Date("2027-01-01T01:00:00Z"));
    expect(out.from).toBe("2026-01-01T04:00:00.000Z");
    expect(out.to).toBe("2027-01-01T04:00:00.000Z");
  });

  it("month window for early-month anchor includes the rest of the month (regression: iskoriscenost showing 0% on Mesec)", () => {
    // The original bug: at server-now 2026-05-12 23:06 UTC, the OLD rolling
    // window was [2026-04-13, 2026-05-13) — excluding SCHEDULED sessions on
    // May 13/14/15. The calendar window now includes them.
    const out = computePeriodWindow("month", new Date("2026-05-12T23:06:00Z"));
    const sessionStart = new Date("2026-05-14T16:00:00Z").getTime();
    expect(sessionStart).toBeGreaterThanOrEqual(new Date(out.from!).getTime());
    expect(sessionStart).toBeLessThan(new Date(out.to!).getTime());
  });
});
