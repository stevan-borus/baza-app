import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { describe, expect, it } from "vitest";
import {
  STUDIO_DAY_START_HOUR,
  STUDIO_TIMEZONE,
  startOfStudioDay,
  studioDayStartFor,
} from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

// A package starts at the top of the studio's day, not at the instant the
// admin tapped submit and not at midnight. The studio's first classes are
// at 06:00, so the day opens at 05:00 — early enough that nothing bookable
// is ever excluded, late enough to stay unambiguously "that morning".
describe("startOfStudioDay", () => {
  it("opens the day at 05:00 Belgrade, not midnight", () => {
    // 20 July 14:51 Belgrade (12:51Z) -> 20 July 05:00 Belgrade = 03:00Z.
    const result = startOfStudioDay(new Date("2026-07-20T12:51:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-20T03:00:00.000Z");
  });

  it("uses the winter offset when the date is in winter", () => {
    // January: Belgrade is UTC+1, so 05:00 local is 04:00Z.
    const result = startOfStudioDay(new Date("2026-01-15T12:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-01-15T04:00:00.000Z");
  });

  it("is idempotent - a value already at the day's start stays put", () => {
    const once = startOfStudioDay(new Date("2026-07-20T12:51:00.000Z"));
    expect(startOfStudioDay(once).toISOString()).toBe(once.toISOString());
  });

  it("keeps an early-morning instant on its own calendar day", () => {
    // 05:30 Belgrade on the 20th is already past the day's start, so it
    // belongs to the 20th - it must not roll back to the 19th.
    const result = startOfStudioDay(new Date("2026-07-20T03:30:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-20T03:00:00.000Z");
  });

  it("treats the small hours as still belonging to the previous studio day", () => {
    // 02:00 Belgrade on the 20th is before the 05:00 opening. Nothing is
    // bookable then, but the value must resolve somewhere sane: the 19th's
    // start, since that studio day has not closed yet.
    const result = startOfStudioDay(new Date("2026-07-20T00:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-19T03:00:00.000Z");
  });

  it("opens before the studio's first class", () => {
    // The constant exists so this relationship is checkable rather than a
    // magic number: the day must open at or before the 06:00 first class.
    expect(STUDIO_DAY_START_HOUR).toBeLessThan(6);
  });
});

// A date the admin PICKED is a calendar day, not an instant. Both a
// date-mode picker on a Belgrade device (local midnight = 22:00Z the day
// before) and a UTC caller (00:00Z = 02:00 Belgrade) hand back a value
// sitting BEFORE the 05:00 opening — so instant-based normalization would
// start the package a day earlier than the admin chose.
describe("studioDayStartFor", () => {
  it("keeps a UTC-midnight pick on the day the admin named", () => {
    // 1 August 00:00Z is 02:00 Belgrade — before opening, but the admin
    // picked the 1st, so the package opens 1 Aug 05:00 (03:00Z).
    const result = studioDayStartFor(new Date("2026-08-01T00:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("keeps a Belgrade local-midnight pick on the day the admin named", () => {
    // What the real date picker produces on an admin's device: local
    // midnight on 1 Aug = 22:00Z on 31 July. Must NOT become 31 July.
    const localMidnight = new Date("2026-07-31T22:00:00.000Z");
    const result = studioDayStartFor(localMidnight);
    expect(dayjs(result).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-08-01 05:00",
    );
  });

  it("never moves a pick to a different calendar day", () => {
    // The invariant, swept across a month including the DST change: the
    // day that goes in is the day that comes out.
    for (let day = 1; day <= 31; day += 1) {
      const iso = `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`;
      const result = studioDayStartFor(new Date(iso));
      expect(dayjs(result).tz(STUDIO_TIMEZONE).format("YYYY-MM-DD")).toBe(
        iso.slice(0, 10),
      );
    }
  });

  it("is idempotent", () => {
    const once = studioDayStartFor(new Date("2026-08-01T00:00:00.000Z"));
    expect(studioDayStartFor(once).toISOString()).toBe(once.toISOString());
  });

  it("opens the picked day at 05:00 in winter too", () => {
    const result = studioDayStartFor(new Date("2026-01-15T00:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-01-15T04:00:00.000Z");
  });
});

describe("STUDIO_DAY_START_HOUR", () => {
  it("opens before the studio's first class", () => {
    // The constant exists so this relationship is checkable rather than a
    // magic number: the day must open at or before the 06:00 first class.
    expect(STUDIO_DAY_START_HOUR).toBeLessThan(6);
  });
});
