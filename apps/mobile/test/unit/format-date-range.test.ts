import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { formatDateRange } from "@/lib/format";

// `formatDateRange` renders the endpoints in the STUDIO zone (that is the zone
// the windows are defined in), so the day-of-month no longer depends on the
// runner's offset. TZ is still pinned here to prove that: these assertions must
// hold identically on a CET dev machine and a UTC CI runner, and this repo has
// shipped green-locally/red-in-CI date tests before. This is the "no racy date
// math" rule from AGENTS.md applied to display formatting.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

// `toExclusive` is an exclusive upper bound; the label shows the last INCLUDED
// instant (toExclusive − 1ms), read as a studio calendar day. The windows these
// labels describe close at 05:00 Belgrade — 03:00Z in summer, 04:00Z in winter
// — so a May window ends at `2026-06-01T03:00Z` and reads as May 31. The year
// appears only when the range crosses a calendar-year boundary.
describe("formatDateRange", () => {
  it("omits the year for a same-year range", () => {
    expect(
      formatDateRange(
        "2026-05-01T03:00:00.000Z",
        "2026-06-01T03:00:00.000Z",
        "en-US",
      ),
    ).toBe("May 1 – May 31");
  });

  it("shows the year when the range crosses a year boundary", () => {
    // Exclusive end 2027-02-01 05:00 Belgrade → inclusiveTo 2027-01-31, a
    // different year from the Nov 2026 start, so the year is shown on both.
    expect(
      formatDateRange(
        "2026-11-01T04:00:00.000Z",
        "2027-02-01T04:00:00.000Z",
        "en-US",
      ),
    ).toBe("Nov 1, 2026 – Jan 31, 2027");
  });

  it("labels a studio-boundary year without leaking into the next one", () => {
    // Godina. The exclusive bound is 05:00 Belgrade on 1 Jan 2027, whose
    // studio day is 31 Dec 2026 — so the range sits inside one year and the
    // year suffix is (correctly) dropped. Before the studio-day fix this read
    // "Jan 1, 2026 – Jan 1, 2027".
    expect(
      formatDateRange(
        "2026-01-01T04:00:00.000Z",
        "2027-01-01T04:00:00.000Z",
        "en-US",
      ),
    ).toBe("Jan 1 – Dec 31");
  });

  it("reads the endpoints in the studio zone, not the viewer's", () => {
    // The regression this guards: reading the exclusive bound as an absolute
    // instant minus 1ms lands at 04:59 on 1 June, so a naive label said
    // "May 1 – Jun 1" for the Mesec pill. Same input, both runner zones.
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Europe/Belgrade", "America/New_York"]) {
        process.env.TZ = tz;
        expect(
          formatDateRange(
            "2026-05-01T03:00:00.000Z",
            "2026-06-01T03:00:00.000Z",
            "en-US",
          ),
        ).toBe("May 1 – May 31");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("does not roll a midnight-aligned start back to the previous day", () => {
    // Not every caller hands over a STUDIO window. The Naplata month and the
    // revenue chart buckets start at local midnight, which is before the 05:00
    // opening — so resolving `from` to a studio day the way the END is
    // resolved would label a May window "Apr 30" and a one-day bucket as two
    // days. The two endpoints are deliberately asymmetric; this pins that.
    expect(
      formatDateRange(
        "2026-04-30T22:00:00.000Z", // 1 May 00:00 Belgrade
        "2026-05-31T21:59:59.999Z", // 31 May 23:59:59.999 Belgrade
        "en-US",
      ),
    ).toBe("May 1 – May 31");

    // A single day-sized bucket stays a single day.
    expect(
      formatDateRange(
        "2026-05-11T22:00:00.000Z",
        "2026-05-12T22:00:00.000Z",
        "en-US",
      ),
    ).toBe("May 12 – May 12");
  });

  it("honors the locale param (sr vs en)", () => {
    expect(
      formatDateRange(
        "2026-05-01T03:00:00.000Z",
        "2026-06-01T03:00:00.000Z",
        "sr-RS",
      ),
    ).toBe("1. мај – 31. мај");
  });
});
