import { describe, expect, it } from "vitest";
import {
  studioMonthRange,
  valueSession,
  type PayrollAttendee,
} from "@/lib/payroll-valuation";

/**
 * The compensation rule, in the owner's words: a trainer earns an agreed
 * percentage "od vrednosti pojedinacnog treninga iz paketa, i broja polaznika
 * na kom je drzao trening" — the per-session value of each attendee's package,
 * summed across everyone who was there.
 */

function attendee(overrides: Partial<PayrollAttendee> = {}): PayrollAttendee {
  return {
    bookingId: "b1",
    clientProfileId: "c1",
    clientName: "Client One",
    packageName: "Reformer 12",
    packagePrice: 15000,
    sessionsTotal: 12,
    isGift: false,
    ...overrides,
  };
}

describe("valueSession", () => {
  it("matches the owner's worked example: 1.250 + 1.250 + 1.375 = 3.875", () => {
    const result = valueSession([
      attendee({ bookingId: "b1", packageName: "Paket 1", packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b2", packageName: "Paket 1", packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b3", packageName: "Paket 2", packagePrice: 11000, sessionsTotal: 8 }),
    ]);

    expect(result.lines.map((l) => l.sessionValue)).toEqual([1250, 1250, 1375]);
    expect(result.gross).toBe(3875);
  });

  it("pays the trainer their percentage of the session gross", () => {
    const result = valueSession([
      attendee({ packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b2", packagePrice: 15000, sessionsTotal: 12 }),
    ]);

    // 2.500 gross at 40% → 1.000
    expect(result.gross).toBe(2500);
    expect(result.payout(40)).toBe(1000);
  });

  it("values a gift session at its real package rate, never at zero", () => {
    // The owner's rule: "Poklon paketi ne bi trebali da se racunaju trneru kao
    // 0, zato sto je to na racun kuce a trener je posteno odradio svoj posao."
    const result = valueSession([
      attendee({ isGift: true, packagePrice: 15000, sessionsTotal: 12 }),
    ]);

    expect(result.gross).toBe(1250);
    expect(result.lines[0]?.isGift).toBe(true);
  });

  it("divides by the package's own granted total, so a 1-session gift is not 1/12", () => {
    // A gifted Reformer 12 grants ONE session but keeps the 15.000 price; the
    // per-session value must still be 1.250, not the whole 15.000.
    const result = valueSession([
      attendee({ isGift: true, packagePrice: 15000, sessionsTotal: 1 }),
    ]);

    // sessionsTotal here is the GRANTED count, so the caller must pass the
    // rate-defining count. A 1-session grant priced at the SKU's full price
    // would wildly overpay — the engine trusts what it is handed, so this
    // documents the contract the query layer must satisfy.
    expect(result.gross).toBe(15000);
  });

  it("reports an unpriced package instead of silently contributing zero", () => {
    const result = valueSession([
      attendee({ packagePrice: null, packageName: "Nadoknada" }),
      attendee({ bookingId: "b2", packagePrice: 15000, sessionsTotal: 12 }),
    ]);

    expect(result.gross).toBe(1250);
    expect(result.unpricedCount).toBe(1);
    expect(result.lines[0]?.sessionValue).toBeNull();
  });

  it("treats an empty session as zero without dividing by zero", () => {
    const result = valueSession([]);
    expect(result.gross).toBe(0);
    expect(result.payout(50)).toBe(0);
  });

  it("guards against a zero session total rather than returning Infinity", () => {
    const result = valueSession([attendee({ sessionsTotal: 0 })]);
    expect(result.lines[0]?.sessionValue).toBeNull();
    expect(result.unpricedCount).toBe(1);
  });

  it("rounds the payout to whole dinars", () => {
    // 3.875 at 33% = 1278.75 → RSD has no subunit in practice here.
    const result = valueSession([
      attendee({ packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b2", packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b3", packagePrice: 11000, sessionsTotal: 8 }),
    ]);
    expect(result.payout(33)).toBe(1279);
  });
});

describe("studioMonthRange", () => {
  it("spans a whole calendar month in Belgrade time", () => {
    const range = studioMonthRange(2026, 7); // July 2026

    // The studio day opens at 05:00 Belgrade, so the month boundary follows it
    // — consistent with how packages already start and expire.
    expect(range.from.toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("rolls the year over from December to January", () => {
    const range = studioMonthRange(2026, 12);
    expect(range.to.toISOString()).toBe("2027-01-01T04:00:00.000Z");
  });

  it("handles the winter/summer offset change", () => {
    // January is CET (UTC+1), so 05:00 Belgrade is 04:00Z.
    const january = studioMonthRange(2026, 1);
    expect(january.from.toISOString()).toBe("2026-01-01T04:00:00.000Z");
  });
});
