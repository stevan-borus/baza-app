import dayjs from "dayjs";
import "dayjs/locale/sr";
import { describe, expect, it } from "vitest";
import { computePeriodWindow } from "@/lib/admin/use-period-pill";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { startOfStudioDay } from "@/lib/studio-time";

function withStrictDateParsing(run: () => void): void {
  const NativeDate = globalThis.Date;
  globalThis.Date = new Proxy(NativeDate, {
    construct(target, args, newTarget) {
      if (
        args.length === 1 &&
        typeof args[0] === "string" &&
        !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(args[0])
      ) {
        return Reflect.construct(target, [NaN], newTarget);
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
  try {
    run();
  } finally {
    globalThis.Date = NativeDate;
  }
}

describe("timezone conversion with Hermes-style Date parsing", () => {
  it("keeps the admin October window and studio boundaries valid", () => {
    withStrictDateParsing(() => {
      const anchor = new Date("2026-10-23T09:00:00.000Z");
      expect(new Date("10/23/2026, 11:00:00 AM").getTime()).toBeNaN();
      expect(new Date("10/23/2026, 11:00:00\u202fAM").getTime()).toBeNaN();
      expect(computePeriodWindow("month", anchor)).toEqual({
        from: "2026-10-01T03:00:00.000Z",
        to: "2026-11-01T04:00:00.000Z",
      });
      expect(startOfStudioDay(anchor).toISOString()).toBe(
        "2026-10-23T03:00:00.000Z",
      );
      const month = studioMonthRange(2026, 7);
      expect(month.from.toISOString()).toBe("2026-07-01T03:00:00.000Z");
      expect(month.to.toISOString()).toBe("2026-08-01T03:00:00.000Z");
      expect(dayjs(anchor).tz("Europe/Belgrade").format()).toBe(
        "2026-10-23T11:00:00+02:00",
      );
    });
  });

  it.each([
    ["2026-01-15T09:00:00.123Z", "2026-01-15T10:00:00.123+01:00", 60],
    ["2026-07-15T09:00:00.123Z", "2026-07-15T11:00:00.123+02:00", 120],
    ["2026-03-29T00:59:59.999Z", "2026-03-29T01:59:59.999+01:00", 60],
    ["2026-03-29T01:00:00.000Z", "2026-03-29T03:00:00.000+02:00", 120],
    ["2026-10-25T00:59:59.999Z", "2026-10-25T02:59:59.999+02:00", 120],
    ["2026-10-25T01:00:00.000Z", "2026-10-25T02:00:00.000+01:00", 60],
  ])("converts %s across Belgrade DST without losing the instant", (instant, wallTime, offset) => {
    withStrictDateParsing(() => {
      const local = dayjs(instant).tz("Europe/Belgrade");
      expect(local.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(wallTime);
      expect(local.utcOffset()).toBe(offset);
      expect(local.toISOString()).toBe(instant);
    });
  });

  it("preserves the instant and locale when converting an already zoned instance", () => {
    withStrictDateParsing(() => {
      const source = dayjs("2026-10-23T09:00:00.123Z")
        .locale("sr")
        .tz("Asia/Kathmandu");
      const result = source.tz("Europe/Belgrade");
      expect(result.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(
        "2026-10-23T11:00:00.123+02:00",
      );
      expect(result.toISOString()).toBe("2026-10-23T09:00:00.123Z");
      expect(result.locale()).toBe("sr");
      expect(source.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(
        "2026-10-23T14:45:00.123+05:45",
      );
      expect(source.offsetName("long")).toBe("Nepal Time");
    });
  });

  it.each([
    ["2026-07-15T09:00:00.123Z", "2026-07-15T11:00:00.123-04:00", "2026-07-15T15:00:00.123Z"],
    ["2026-01-15T10:00:00.123Z", "2026-01-15T11:00:00.123-05:00", "2026-01-15T16:00:00.123Z"],
  ])("keeps local time without changing the source for %s", (instant, wallTime, shiftedInstant) => {
    withStrictDateParsing(() => {
      const source = dayjs(instant).tz("Europe/Belgrade");
      const before = source.format("YYYY-MM-DDTHH:mm:ss.SSSZ");
      const dayStart = source.startOf("day").toISOString();
      const zoneName = source.offsetName("long");
      const result = source.tz("America/New_York", true);
      expect(result).not.toBe(source);
      expect(result.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(wallTime);
      expect(result.toISOString()).toBe(shiftedInstant);
      expect(source.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(before);
      expect(source.toISOString()).toBe(instant);
      expect(source.startOf("day").toISOString()).toBe(dayStart);
      expect(source.offsetName("long")).toBe(zoneName);
    });
  });

  it("keeps a local instance's clock when assigning the studio timezone", () => {
    withStrictDateParsing(() => {
      const source = dayjs("2026-10-23T11:00:00.123");
      const originalInstant = source.toISOString();
      const result = source.tz("Europe/Belgrade", true);
      expect(result.format("YYYY-MM-DDTHH:mm:ss.SSSZ")).toBe(
        "2026-10-23T11:00:00.123+02:00",
      );
      expect(result.toISOString()).toBe("2026-10-23T09:00:00.123Z");
      expect(source.toISOString()).toBe(originalInstant);
    });
  });

  it("uses the default timezone and retains it for calendar boundaries", () => {
    withStrictDateParsing(() => {
      dayjs.tz.setDefault("Europe/Belgrade");
      try {
        const local = dayjs.utc("2026-10-23T09:00:00.123Z").tz();
        expect(local.format()).toBe("2026-10-23T11:00:00+02:00");
        expect(local.startOf("day").toISOString()).toBe("2026-10-22T22:00:00.000Z");
        expect(local.endOf("day").toISOString()).toBe("2026-10-23T21:59:59.999Z");
        expect(dayjs.tz("2026-10-23 11:00").toISOString()).toBe(
          "2026-10-23T09:00:00.000Z",
        );
      } finally {
        dayjs.tz.setDefault();
      }
    });
  });

  it("converts to UTC with and without keeping local time", () => {
    withStrictDateParsing(() => {
      const source = dayjs("2026-10-23T09:00:00.123Z").tz("Europe/Belgrade");
      const utc = source.tz("UTC");
      expect(utc.isUTC()).toBe(true);
      expect(utc.toISOString()).toBe("2026-10-23T09:00:00.123Z");
      expect(source.tz("UTC", true).toISOString()).toBe("2026-10-23T11:00:00.123Z");
      expect(source.format()).toBe("2026-10-23T11:00:00+02:00");
      expect(source.offsetName("long")).toBe("Central European Summer Time");
    });
  });

  it("keeps invalid input invalid without throwing", () => {
    withStrictDateParsing(() => {
      const invalid = dayjs(NaN);
      expect(invalid.tz("Europe/Belgrade").isValid()).toBe(false);
      expect(invalid.tz("Europe/Belgrade", true).format()).toBe("Invalid Date");
      expect(dayjs.tz("invalid", "Europe/Belgrade").isValid()).toBe(false);
    });
  });
});
