import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { describe, expect, it } from "vitest";
import { computePackageExpiresAt } from "@/lib/package-expiry";
import { STUDIO_TIMEZONE, startOfStudioDay } from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

// The expiry rule a client is actually sold: "30 days" means the pack is
// good through the END of the 30th day, not until the same o'clock they
// happened to pay. Purchase time-of-day must not shorten the last day.
describe("computePackageExpiresAt", () => {
  it("expires at the end of the last valid studio day", () => {
    // Bought 23 June 2026 at 09:00 Belgrade (07:00Z), 30-day validity.
    // The start day is day ONE, so day 30 is 22 July and the pack dies
    // 22 July 23:59:59.999 Belgrade. "30 days" must never span 31.
    const expiresAt = computePackageExpiresAt(
      new Date("2026-06-23T07:00:00.000Z"),
      30,
    );
    expect(expiresAt.toISOString()).toBe("2026-07-22T21:59:59.999Z");
  });

  it("gives the same expiry no matter the time of day the pack was bought", () => {
    // This is the actual bug: an 08:00 buyer used to lose their final day
    // twelve hours before a 20:00 buyer. Both must now get the whole day.
    const morning = computePackageExpiresAt(
      new Date("2026-06-23T06:00:00.000Z"),
      30,
    );
    const evening = computePackageExpiresAt(
      new Date("2026-06-23T18:00:00.000Z"),
      30,
    );
    expect(morning.toISOString()).toBe(evening.toISOString());
  });

  it("counts validity in calendar days across a DST transition", () => {
    // 20 Oct 2026 is day 1, so day 30 is 18 Nov - AFTER Belgrade falls back
    // to CET, hence the 22:59:59.999Z (UTC+1) boundary rather than summer's
    // 21:59:59.999Z. Adding raw 24h blocks would drift an hour across the
    // transition and could land on the wrong calendar day; calendar-day
    // arithmetic in the studio zone cannot.
    const expiresAt = computePackageExpiresAt(
      new Date("2026-10-20T08:00:00.000Z"),
      30,
    );
    expect(expiresAt.toISOString()).toBe("2026-11-18T22:59:59.999Z");
  });

  it("spans exactly `validityDays` calendar days, never one more", () => {
    // The rule in plain terms: a 30-day pack covers 30 distinct studio
    // days, not 31. Counted inclusively - both the start day and the
    // expiry day are days the client can book.
    const startsAt = new Date("2026-06-23T07:00:00.000Z");
    for (const validityDays of [1, 30, 31, 60, 365]) {
      const expiresAt = computePackageExpiresAt(startsAt, validityDays);
      const firstDay = dayjs(startsAt).tz(STUDIO_TIMEZONE).startOf("day");
      const lastDay = dayjs(expiresAt).tz(STUDIO_TIMEZONE).startOf("day");
      expect(lastDay.diff(firstDay, "day") + 1).toBe(validityDays);
    }
  });

  it("spans 05:00 on day one to the close of the last day", () => {
    // The two boundaries together, as a client would describe them: the pack
    // opens the morning it starts and dies at the end of its last day. 20
    // July 05:00 Belgrade (03:00Z) + 30 days -> 18 Aug 23:59:59.999 (21:59Z).
    const startsAt = startOfStudioDay(new Date("2026-07-20T12:51:00.000Z"));
    expect(startsAt.toISOString()).toBe("2026-07-20T03:00:00.000Z");
    expect(computePackageExpiresAt(startsAt, 30).toISOString()).toBe(
      "2026-08-18T21:59:59.999Z",
    );
  });

  it("counts the same 30 days whether or not startsAt was normalized", () => {
    // Normalizing the start must not quietly shift the expiry DATE — the
    // admin picked a day, and both ends key off that day.
    const rawPick = new Date("2026-07-20T12:51:00.000Z");
    const normalized = startOfStudioDay(rawPick);
    expect(
      dayjs(computePackageExpiresAt(normalized, 30))
        .tz(STUDIO_TIMEZONE)
        .format("YYYY-MM-DD"),
    ).toBe(
      dayjs(computePackageExpiresAt(rawPick, 30))
        .tz(STUDIO_TIMEZONE)
        .format("YYYY-MM-DD"),
    );
  });

  it("a 1-day package is valid through the end of its own start day", () => {
    const expiresAt = computePackageExpiresAt(
      new Date("2026-07-23T07:00:00.000Z"),
      1,
    );
    expect(expiresAt.toISOString()).toBe("2026-07-23T21:59:59.999Z");
  });
});
