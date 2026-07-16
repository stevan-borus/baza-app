import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { formatDateRange } from "@/lib/format";

// `formatDateRange` renders with `toLocaleDateString`, which uses the process's
// local timezone. Pin TZ for this file so the day-of-month in the assertions is
// deterministic across machines (local dev, UTC CI, any runner) — otherwise a
// `toExclusive` at a UTC day boundary renders as a different calendar day
// depending on the runner's offset. This is the "no racy date math" rule from
// AGENTS.md applied to display formatting.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

// `toExclusive` is an exclusive upper bound; the label shows the last INCLUDED
// instant (toExclusive − 1ms). In UTC, an exclusive end at `2026-06-01T00:00Z`
// therefore displays as May 31. The year appears only when the range crosses a
// calendar-year boundary.
describe("formatDateRange", () => {
  it("omits the year for a same-year range", () => {
    expect(
      formatDateRange(
        "2026-05-01T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "en-US",
      ),
    ).toBe("May 1 – May 31");
  });

  it("shows the year when the range crosses a year boundary", () => {
    // Exclusive end 2027-02-01 → inclusiveTo 2027-01-31, a different UTC year
    // from the Nov 2026 start, so the year is shown on both endpoints.
    expect(
      formatDateRange(
        "2026-11-01T00:00:00.000Z",
        "2027-02-01T00:00:00.000Z",
        "en-US",
      ),
    ).toBe("Nov 1, 2026 – Jan 31, 2027");
  });

  it("honors the locale param (sr vs en)", () => {
    expect(
      formatDateRange(
        "2026-05-01T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "sr-RS",
      ),
    ).toBe("1. мај – 31. мај");
  });
});
