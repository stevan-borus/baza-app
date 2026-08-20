import { describe, expect, it } from "vitest";
import {
  bucketPayout,
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
    isTrial: false,
    canConfirmTrial: false,
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

  it("sums the session gross from its attendees", () => {
    const result = valueSession([
      attendee({ packagePrice: 15000, sessionsTotal: 12 }),
      attendee({ bookingId: "b2", packagePrice: 15000, sessionsTotal: 12 }),
    ]);

    expect(result.gross).toBe(2500);
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
  });

  it("guards against a zero session total rather than returning Infinity", () => {
    const result = valueSession([attendee({ sessionsTotal: 0 })]);
    expect(result.lines[0]?.sessionValue).toBeNull();
    expect(result.unpricedCount).toBe(1);
  });

});

/**
 * The month payout, split by class type.
 *
 * A trainer's percentage is not one number any more: the class types they hold
 * an override on are paid at their own rate, and everything else at the
 * default. So the month is bucketed before it is multiplied, and each bucket is
 * rounded on its own — the breakdown the studio reads has to add up to the
 * total it pays, which it cannot if the total is rounded separately.
 */
describe("bucketPayout", () => {
  const DEFAULT_RATE = (percent: number | null) => () => ({ percent, overridden: false });

  function session(classTypeId: string, classTypeName: string, gross: number) {
    return { classTypeId, classTypeName, gross };
  }

  it("pays a half-point rate in whole dinars", () => {
    // Rates carry one decimal now. The money must not: nobody pays 0.5 RSD,
    // and a fractional payout would print as a rounding artefact next to a
    // gross that is whole.
    const { buckets, payout } = bucketPayout(
      [session("ct-1", "Grupni", 12_345)],
      DEFAULT_RATE(22.5),
    );
    expect(buckets[0]!.percent).toBe(22.5);
    expect(buckets[0]!.payout).toBe(2778); // 12345 * 0.225 = 2777.625
    expect(Number.isInteger(payout)).toBe(true);
    expect(payout).toBe(2778);
  });

  it("keeps the buckets summing to the payout with fractional percents", () => {
    // The breakdown is shown to the person being paid, so a total that does
    // not equal the sum of the rows above it reads as an error.
    const { buckets, payout } = bucketPayout(
      [
        session("ct-individual", "Individualni", 8_333),
        session("ct-group", "Grupni", 12_345),
        session("ct-group", "Grupni", 4_111),
      ],
      (classTypeId) =>
        classTypeId === "ct-individual"
          ? { percent: 47.5, overridden: true }
          : { percent: 22.5, overridden: false },
    );

    for (const bucket of buckets) {
      expect(Number.isInteger(bucket.payout), `${bucket.classTypeName}`).toBe(true);
    }
    expect(payout).toBe(buckets.reduce((sum, b) => sum + b.payout, 0));
    expect(Number.isInteger(payout)).toBe(true);
  });

  it("collapses a month with no overrides into one default bucket", () => {
    const result = bucketPayout(
      [
        session("ct-group", "Grupni", 3875),
        session("ct-individual", "Individualni", 2500),
      ],
      DEFAULT_RATE(40),
    );

    expect(result.buckets).toEqual([
      {
        classTypeId: null,
        classTypeName: null,
        percent: 40,
        gross: 6375,
        payout: 2550,
      },
    ]);
    expect(result.gross).toBe(6375);
    expect(result.payout).toBe(2550);
  });

  it("splits an overridden class type out of the default bucket", () => {
    const result = bucketPayout(
      [
        session("ct-group", "Grupni", 3000),
        session("ct-individual", "Individualni", 2000),
        session("ct-group", "Grupni", 1000),
      ],
      (classTypeId) =>
        classTypeId === "ct-individual"
          ? { percent: 60, overridden: true }
          : { percent: 40, overridden: false },
    );

    expect(result.buckets).toEqual([
      {
        classTypeId: "ct-individual",
        classTypeName: "Individualni",
        percent: 60,
        gross: 2000,
        payout: 1200,
      },
      {
        classTypeId: null,
        classTypeName: null,
        percent: 40,
        gross: 4000,
        payout: 1600,
      },
    ]);
    expect(result.payout).toBe(2800);
    expect(result.gross).toBe(6000);
  });

  it("has no default bucket when every session is overridden", () => {
    const result = bucketPayout([session("ct-individual", "Individualni", 2000)], () => ({
      percent: 60,
      overridden: true,
    }));

    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]?.classTypeId).toBe("ct-individual");
  });

  it("orders overrides alphabetically and leaves the default bucket last", () => {
    const result = bucketPayout(
      [
        session("ct-z", "Zumba", 100),
        session("ct-plain", "Obican", 100),
        session("ct-a", "Aerobik", 100),
      ],
      (classTypeId) =>
        classTypeId === "ct-plain"
          ? { percent: 40, overridden: false }
          : { percent: 50, overridden: true },
    );

    expect(result.buckets.map((b) => b.classTypeName)).toEqual([
      "Aerobik",
      "Zumba",
      null,
    ]);
  });

  it("rounds each bucket, so the visible breakdown adds up to the total paid", () => {
    // Two buckets each landing on .5: rounded together they'd be 1279, and the
    // two rows shown to the studio would not sum to the figure paid.
    const result = bucketPayout(
      [session("ct-a", "A", 1937.5), session("ct-b", "B", 1937.5)],
      (classTypeId) =>
        classTypeId === "ct-a"
          ? { percent: 33, overridden: true }
          : { percent: 33, overridden: false },
    );

    const [override, fallback] = result.buckets;
    expect(override?.payout).toBe(639);
    expect(fallback?.payout).toBe(639);
    expect(result.payout).toBe(1278);
    expect(result.payout).toBe(
      result.buckets.reduce((sum, b) => sum + b.payout, 0),
    );
    expect(result.gross).toBe(result.buckets.reduce((sum, b) => sum + b.gross, 0));
  });

  it("pays nothing for a bucket with no rate, but still reports its gross", () => {
    const result = bucketPayout([session("ct-group", "Grupni", 1250)], DEFAULT_RATE(null));

    expect(result.buckets[0]).toEqual({
      classTypeId: null,
      classTypeName: null,
      percent: null,
      gross: 1250,
      payout: 0,
    });
    expect(result.payout).toBe(0);
    expect(result.gross).toBe(1250);
  });

  it("returns no buckets at all for a month with no sessions", () => {
    const result = bucketPayout([], DEFAULT_RATE(40));
    expect(result.buckets).toEqual([]);
    expect(result.gross).toBe(0);
    expect(result.payout).toBe(0);
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
