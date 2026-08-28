/**
 * Serbian date convention: the day number carries a trailing dot.
 *
 * "24. septembra", never "24 Septembar". The bundled dayjs `sr` locale
 * capitalizes month and weekday names (they head its LL/LLLL formats) and only
 * ships the nominative, but Serbian writes them lowercase mid-sentence AND in
 * the genitive — "Ističe 24. septembra" — so `formatDayMonth` maps the month
 * itself. English keeps title case and has no case to inflect.
 *
 * TZ is pinned to UTC because this repo has shipped locale-formatting tests
 * that were green on a CET laptop and red on a UTC CI runner. Every instant
 * below is chosen so the two zones would disagree if the helpers ever read the
 * runner's offset for something they shouldn't.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  formatDayMonth,
  formatFullDayDate,
  formatFullDayDateTime,
  formatCancellationWhen,
} from "@/lib/format-date";

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

// Thursday 2026-09-24, 10:00 UTC.
const SEPTEMBER_24 = new Date("2026-09-24T10:00:00.000Z");
// Friday 2026-08-28, 14:00 UTC.
const AUGUST_28 = new Date("2026-08-28T14:00:00.000Z");

describe("formatDayMonth", () => {
  it("puts a dot after the day number in Serbian", () => {
    expect(formatDayMonth(SEPTEMBER_24, "sr")).toBe("24. septembra");
  });

  it("lowercases the Serbian month so it reads mid-sentence", () => {
    expect(formatDayMonth(AUGUST_28, "sr")).toBe("28. avgusta");
  });

  it("keeps the English convention: no dot, title-cased month", () => {
    expect(formatDayMonth(SEPTEMBER_24, "en")).toBe("24 September");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatDayMonth("2026-09-24T10:00:00.000Z", "sr")).toBe(
      "24. septembra",
    );
  });

  // The regression guard. dayjs' `sr` bundle only ships nominative months,
  // so every one of the twelve is a hand-written mapping that can rot.
  const GENITIVE_BY_MONTH: ReadonlyArray<[string, string]> = [
    ["2026-01-15", "15. januara"],
    ["2026-02-15", "15. februara"],
    ["2026-03-15", "15. marta"],
    ["2026-04-15", "15. aprila"],
    ["2026-05-15", "15. maja"],
    ["2026-06-15", "15. juna"],
    ["2026-07-15", "15. jula"],
    ["2026-08-15", "15. avgusta"],
    ["2026-09-15", "15. septembra"],
    ["2026-10-15", "15. oktobra"],
    ["2026-11-15", "15. novembra"],
    ["2026-12-15", "15. decembra"],
  ];

  it.each(GENITIVE_BY_MONTH)(
    "renders %s in the Serbian genitive: %s",
    (iso, expected) => {
      expect(formatDayMonth(`${iso}T12:00:00.000Z`, "sr")).toBe(expected);
    },
  );

  it("keeps English months nominative across the year", () => {
    expect(formatDayMonth("2026-05-15T12:00:00.000Z", "en")).toBe("15 May");
    expect(formatDayMonth("2026-12-15T12:00:00.000Z", "en")).toBe(
      "15 December",
    );
  });
});

describe("formatFullDayDate", () => {
  it("writes the full weekday and a numeric day.month, with no comma", () => {
    expect(formatFullDayDate(AUGUST_28, "sr")).toBe("Petak 28.8.");
  });

  it("uses the English weekday name for en", () => {
    expect(formatFullDayDate(AUGUST_28, "en")).toBe("Friday 28.8.");
  });

  it("never abbreviates the weekday", () => {
    expect(formatFullDayDate(SEPTEMBER_24, "sr")).toBe("Četvrtak 24.9.");
    expect(formatFullDayDate(SEPTEMBER_24, "sr")).not.toContain("Čet.");
  });
});

describe("formatFullDayDateTime", () => {
  it("appends the 24h time to the full day date", () => {
    expect(formatFullDayDateTime(AUGUST_28, "sr")).toBe("Petak 28.8. 14:00");
  });

  it("uses the English weekday for en", () => {
    expect(formatFullDayDateTime(AUGUST_28, "en")).toBe("Friday 28.8. 14:00");
  });
});

describe("formatCancellationWhen", () => {
  // "Otkazano u ponedeljak" — the row's own subtitle already prints the class
  // date, so repeating a second full date under it read as noise. The studio
  // asked for the weekday alone.
  //
  // Serbian "u" governs the ACCUSATIVE: sreda→sredu, subota→subotu,
  // nedelja→nedelju. The other four are indeclinable in this slot.
  const SR_ACCUSATIVE: ReadonlyArray<[string, string]> = [
    ["2026-06-08T09:00:00.000Z", "u ponedeljak"],
    ["2026-06-09T09:00:00.000Z", "u utorak"],
    ["2026-06-10T09:00:00.000Z", "u sredu"],
    ["2026-06-11T09:00:00.000Z", "u četvrtak"],
    ["2026-06-12T09:00:00.000Z", "u petak"],
    ["2026-06-13T09:00:00.000Z", "u subotu"],
    ["2026-06-14T09:00:00.000Z", "u nedelju"],
  ];

  it.each(SR_ACCUSATIVE)(
    "inflects %s into the accusative after 'u': %s",
    (iso, expected) => {
      expect(formatCancellationWhen(iso, "sr", new Date(iso))).toBe(expected);
    },
  );

  const EN_WEEKDAYS: ReadonlyArray<[string, string]> = [
    ["2026-06-08T09:00:00.000Z", "on Monday"],
    ["2026-06-09T09:00:00.000Z", "on Tuesday"],
    ["2026-06-10T09:00:00.000Z", "on Wednesday"],
    ["2026-06-11T09:00:00.000Z", "on Thursday"],
    ["2026-06-12T09:00:00.000Z", "on Friday"],
    ["2026-06-13T09:00:00.000Z", "on Saturday"],
    ["2026-06-14T09:00:00.000Z", "on Sunday"],
  ];

  it.each(EN_WEEKDAYS)("names the English weekday for %s: %s", (iso, expected) => {
    expect(formatCancellationWhen(iso, "en", new Date(iso))).toBe(expected);
  });

  it("keeps the bare weekday for a cancellation inside the last week", () => {
    // Six days back is still unambiguous — there is exactly one "ponedeljak"
    // in the trailing week.
    expect(
      formatCancellationWhen(
        "2026-06-08T09:00:00.000Z",
        "sr",
        new Date("2026-06-14T09:00:00.000Z"),
      ),
    ).toBe("u ponedeljak");
  });

  it("falls back to a date once the weekday stops being unambiguous", () => {
    // Seven days back and the weekday repeats: "u ponedeljak" would be as
    // likely to mean today as last week.
    expect(
      formatCancellationWhen(
        "2026-06-08T09:00:00.000Z",
        "sr",
        new Date("2026-06-15T09:00:00.000Z"),
      ),
    ).toBe("8. juna");
    expect(
      formatCancellationWhen(
        "2026-06-08T09:00:00.000Z",
        "en",
        new Date("2026-06-15T09:00:00.000Z"),
      ),
    ).toBe("8 June");
  });

  it("treats a same-day cancellation as within the week", () => {
    expect(
      formatCancellationWhen(
        "2026-06-14T20:00:00.000Z",
        "sr",
        new Date("2026-06-14T23:00:00.000Z"),
      ),
    ).toBe("u nedelju");
  });

  it("does not print a clock time — the row already carries the class time", () => {
    expect(
      formatCancellationWhen(
        "2026-06-09T14:30:00.000Z",
        "sr",
        new Date("2026-06-09T18:00:00.000Z"),
      ),
    ).not.toContain("14:30");
  });
});
