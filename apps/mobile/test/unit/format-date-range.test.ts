import { describe, expect, it } from "vitest";
import { formatDateRange } from "@/lib/format";

// `toExclusive` is an exclusive upper bound: the label shows the last INCLUDED
// instant (toExclusive − 1ms). The year is shown only when the range crosses a
// calendar-year boundary, so a single-year window like "May 1 – Jun 1" doesn't
// carry a redundant year while "Nov 1, 2026 – Feb 1, 2027" does.
describe("formatDateRange", () => {
  it("omits the year for a same-year range", () => {
    expect(
      formatDateRange(
        "2026-05-01T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "en-US",
      ),
    ).toBe("May 1 – Jun 1");
  });

  it("shows the year when the range crosses a year boundary", () => {
    expect(
      formatDateRange(
        "2026-11-01T00:00:00.000Z",
        "2027-02-01T00:00:00.000Z",
        "en-US",
      ),
    ).toBe("Nov 1, 2026 – Feb 1, 2027");
  });

  it("honors the locale param (sr vs en)", () => {
    expect(
      formatDateRange(
        "2026-05-01T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "sr-RS",
      ),
    ).toBe("1. мај – 1. јун");
    expect(
      formatDateRange(
        "2026-11-01T00:00:00.000Z",
        "2027-02-01T00:00:00.000Z",
        "sr-RS",
      ),
    ).toBe("1. нов 2026. – 1. феб 2027.");
  });
});
