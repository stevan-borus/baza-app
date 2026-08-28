/**
 * Week/month calendar-navigation math.
 *
 * Characterization tests for the navigation state that was copy-pasted
 * across pregled, reservation-mode, client calendar, trainer raspored and
 * the notes SessionPicker. The contract being pinned:
 *
 * - `weekStart` is owned by the arrow buttons (and month-cell/deep-link
 *   jumps) ONLY — picking a day inside the visible week must never page
 *   the calendar.
 * - The week arrows also move `selectedDate` to the new week's first day,
 *   so the focused day is always one of the visible pills.
 * - `month` (the availability query key) follows whichever anchor moved
 *   last, and only changes when a boundary is actually crossed.
 * - `monthDate` (the month-view grid anchor) is owned by the month arrows
 *   and deep-link jumps; selecting a month cell does NOT move it.
 */
import { afterEach, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import "dayjs/locale/sr";

import {
  createWeekNavState,
  goToNextMonth,
  goToNextWeek,
  goToPreviousMonth,
  goToPreviousWeek,
  jumpToDate,
  selectDay,
  selectMonthCell,
  startOfLocaleWeek,
  startOfMondayWeek,
  weekRangeLabel,
} from "@/lib/use-week-navigation";

afterEach(() => {
  dayjs.locale("en");
});

describe("startOfLocaleWeek", () => {
  it("sr locale: week starts on Monday", () => {
    dayjs.locale("sr");
    // 2026-06-10 is a Wednesday.
    const out = startOfLocaleWeek(dayjs("2026-06-10"));
    expect(out.format("YYYY-MM-DD")).toBe("2026-06-08");
    expect(out.day()).toBe(1); // Monday
  });

  it("en locale: week starts on Sunday", () => {
    dayjs.locale("en");
    const out = startOfLocaleWeek(dayjs("2026-06-10"));
    expect(out.format("YYYY-MM-DD")).toBe("2026-06-07");
    expect(out.day()).toBe(0); // Sunday
  });

  it("strips time-of-day (stable arithmetic across DST)", () => {
    dayjs.locale("sr");
    const out = startOfLocaleWeek(dayjs("2026-06-10T15:42:11"));
    expect(out.hour()).toBe(0);
    expect(out.minute()).toBe(0);
  });
});

describe("startOfMondayWeek", () => {
  // The client home strip is labelled "OVA NEDELJA" and must render a real
  // calendar week, Monday through Sunday, whatever the app language is. That
  // rules out `startOfLocaleWeek`, whose answer flips to Sunday under `en`.
  const MONDAY = "2026-06-08";

  it("returns the same Monday from every day of that week", () => {
    dayjs.locale("sr");
    const week = [
      "2026-06-08", // Mon
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14", // Sun
    ];
    for (const day of week) {
      expect(startOfMondayWeek(dayjs(day)).format("YYYY-MM-DD")).toBe(MONDAY);
    }
  });

  it("today is Monday: the week starts on today", () => {
    dayjs.locale("sr");
    expect(startOfMondayWeek(dayjs("2026-06-08")).format("YYYY-MM-DD")).toBe(
      "2026-06-08",
    );
  });

  it("today is Friday: the week starts on the Monday behind it", () => {
    dayjs.locale("sr");
    expect(startOfMondayWeek(dayjs("2026-06-12")).format("YYYY-MM-DD")).toBe(
      "2026-06-08",
    );
  });

  it("today is Sunday: the week starts on the Monday six days back, not tomorrow", () => {
    dayjs.locale("sr");
    // The Sunday trap: `day()` is 0, so any naive `subtract(day(), "day")`
    // leaves Sunday anchoring its own week.
    const out = startOfMondayWeek(dayjs("2026-06-14"));
    expect(out.format("YYYY-MM-DD")).toBe("2026-06-08");
    expect(out.day()).toBe(1);
  });

  it("spans a month boundary", () => {
    dayjs.locale("sr");
    // Wed 2026-07-01 sits in the week of Mon 2026-06-29.
    expect(startOfMondayWeek(dayjs("2026-07-01")).format("YYYY-MM-DD")).toBe(
      "2026-06-29",
    );
    // And a year boundary, for the same reason.
    expect(startOfMondayWeek(dayjs("2027-01-01")).format("YYYY-MM-DD")).toBe(
      "2026-12-28",
    );
  });

  it("is Monday under the en locale too, unlike startOfLocaleWeek", () => {
    dayjs.locale("en");
    expect(startOfMondayWeek(dayjs("2026-06-12")).format("YYYY-MM-DD")).toBe(
      "2026-06-08",
    );
    // Guard the reason this function exists at all.
    expect(startOfLocaleWeek(dayjs("2026-06-12")).format("YYYY-MM-DD")).toBe(
      "2026-06-07",
    );
  });

  it("does not vary with the instance locale either", () => {
    dayjs.locale("en");
    expect(
      startOfMondayWeek(dayjs("2026-06-12").locale("en")).format("YYYY-MM-DD"),
    ).toBe("2026-06-08");
    expect(
      startOfMondayWeek(dayjs("2026-06-12").locale("sr")).format("YYYY-MM-DD"),
    ).toBe("2026-06-08");
  });

  it("strips time-of-day", () => {
    dayjs.locale("sr");
    const out = startOfMondayWeek(dayjs("2026-06-12T15:42:11"));
    expect(out.hour()).toBe(0);
    expect(out.minute()).toBe(0);
    expect(out.second()).toBe(0);
  });
});

describe("createWeekNavState", () => {
  it("derives all four fields from the anchor day", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-10"));
    expect(state.selectedDate).toBe("2026-06-10");
    expect(state.weekStart.format("YYYY-MM-DD")).toBe("2026-06-08");
    expect(state.month).toBe("2026-06");
    expect(state.monthDate.format("YYYY-MM-DD")).toBe("2026-06-01");
  });
});

describe("selectDay", () => {
  it("updates only selectedDate — weekStart and monthDate never move", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-10"));
    const out = selectDay(state, dayjs("2026-06-12"));
    expect(out.selectedDate).toBe("2026-06-12");
    expect(out.weekStart).toBe(state.weekStart);
    expect(out.monthDate).toBe(state.monthDate);
    expect(out.month).toBe("2026-06");
  });

  it("updates month only when the picked day crosses a month boundary", () => {
    dayjs.locale("sr");
    // Week of Mon 2026-06-29 spans June → July. Picking July 1 inside the
    // visible week must update the query month WITHOUT paging the strip.
    const state = selectDay(
      createWeekNavState(dayjs("2026-06-29")),
      dayjs("2026-07-01"),
    );
    expect(state.selectedDate).toBe("2026-07-01");
    expect(state.month).toBe("2026-07");
    expect(state.weekStart.format("YYYY-MM-DD")).toBe("2026-06-29");
    expect(state.monthDate.format("YYYY-MM-DD")).toBe("2026-06-01");
  });
});

describe("week arrows", () => {
  it("page the strip by one week and select the new week's first day", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-10"));
    const next = goToNextWeek(state);
    expect(next.weekStart.format("YYYY-MM-DD")).toBe("2026-06-15");
    expect(next.selectedDate).toBe("2026-06-15");
    expect(next.month).toBe("2026-06");
    // The month-view grid anchor is owned by the month arrows.
    expect(next.monthDate).toBe(state.monthDate);
  });

  it("selects the new week's first day when paging backwards too", () => {
    dayjs.locale("sr");
    const prev = goToPreviousWeek(createWeekNavState(dayjs("2026-06-10")));
    expect(prev.weekStart.format("YYYY-MM-DD")).toBe("2026-06-01");
    expect(prev.selectedDate).toBe("2026-06-01");
  });

  it("en locale: the first day of the new week is Sunday", () => {
    dayjs.locale("en");
    const next = goToNextWeek(createWeekNavState(dayjs("2026-06-10")));
    expect(next.weekStart.format("YYYY-MM-DD")).toBe("2026-06-14");
    expect(next.selectedDate).toBe("2026-06-14");
    expect(next.weekStart.day()).toBe(0); // Sunday
  });

  it("next-then-previous round-trips back to the original week", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-10"));
    const back = goToPreviousWeek(goToNextWeek(state));
    expect(back.weekStart.format("YYYY-MM-DD")).toBe("2026-06-08");
    expect(back.selectedDate).toBe("2026-06-08");
    expect(back.month).toBe("2026-06");
  });

  it("update the query month when the new week start crosses a boundary", () => {
    dayjs.locale("sr");
    // Week of Mon 2026-06-29: previous week starts in June (no-op on month),
    // next week starts Jul 6 → month moves to July.
    const state = createWeekNavState(dayjs("2026-06-29"));
    const next = goToNextWeek(state);
    expect(next.weekStart.format("YYYY-MM-DD")).toBe("2026-07-06");
    expect(next.month).toBe("2026-07");

    const prev = goToPreviousWeek(state);
    expect(prev.weekStart.format("YYYY-MM-DD")).toBe("2026-06-22");
    expect(prev.month).toBe("2026-06");
  });

  it("keeps month and selectedDate in the same month across a boundary", () => {
    dayjs.locale("sr");
    // The bug this pins: with a stale selection, month moved to July while
    // selectedDate stayed in June, so availabilityByMonth never contained
    // the focused day and the list rendered empty.
    const next = goToNextWeek(createWeekNavState(dayjs("2026-06-29")));
    expect(next.selectedDate).toBe("2026-07-06");
    expect(next.month).toBe("2026-07");
    expect(next.selectedDate.slice(0, 7)).toBe(next.month);
  });

  it("month follows the WEEK START, not the week's contents", () => {
    dayjs.locale("sr");
    // From week of Jun 22, paging to the week of Jun 29 (which contains
    // July days) keeps month=June — the start, and now the selection, is
    // still in June.
    const state = goToNextWeek(createWeekNavState(dayjs("2026-06-22")));
    expect(state.weekStart.format("YYYY-MM-DD")).toBe("2026-06-29");
    expect(state.selectedDate).toBe("2026-06-29");
    expect(state.month).toBe("2026-06");
  });

  it("never moves monthDate", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-29"));
    expect(goToNextWeek(state).monthDate).toBe(state.monthDate);
    expect(goToPreviousWeek(state).monthDate).toBe(state.monthDate);
  });
});

describe("month arrows (month view)", () => {
  it("page monthDate and the query month together; selection and week untouched", () => {
    dayjs.locale("sr");
    const state = createWeekNavState(dayjs("2026-06-10"));
    const next = goToNextMonth(state);
    expect(next.monthDate.format("YYYY-MM-DD")).toBe("2026-07-01");
    expect(next.month).toBe("2026-07");
    expect(next.selectedDate).toBe("2026-06-10");
    expect(next.weekStart).toBe(state.weekStart);

    const prev = goToPreviousMonth(state);
    expect(prev.monthDate.format("YYYY-MM-DD")).toBe("2026-05-01");
    expect(prev.month).toBe("2026-05");
  });

  it("handles December → January year crossover", () => {
    dayjs.locale("sr");
    const state = goToNextMonth(createWeekNavState(dayjs("2026-12-15")));
    expect(state.monthDate.format("YYYY-MM-DD")).toBe("2027-01-01");
    expect(state.month).toBe("2027-01");
  });
});

describe("selectMonthCell (tap a day in month view)", () => {
  it("selects the day and re-anchors the week strip; monthDate stays put", () => {
    dayjs.locale("sr");
    // Browsed ahead to July in month view, then tapped Jul 15 (a Wednesday).
    const browsed = goToNextMonth(createWeekNavState(dayjs("2026-06-10")));
    const state = selectMonthCell(browsed, "2026-07-15");
    expect(state.selectedDate).toBe("2026-07-15");
    expect(state.weekStart.format("YYYY-MM-DD")).toBe("2026-07-13");
    expect(state.month).toBe("2026-07");
    // monthDate is owned by the month arrows — the cell tap leaves it.
    expect(state.monthDate).toBe(browsed.monthDate);
  });
});

describe("jumpToDate (deep-link ?date=)", () => {
  it("re-anchors ALL four fields on the target day (unlike selectMonthCell)", () => {
    dayjs.locale("sr");
    const state = jumpToDate(createWeekNavState(dayjs("2026-06-10")), dayjs("2026-08-20"));
    expect(state.selectedDate).toBe("2026-08-20");
    expect(state.weekStart.format("YYYY-MM-DD")).toBe("2026-08-17");
    expect(state.month).toBe("2026-08");
    expect(state.monthDate.format("YYYY-MM-DD")).toBe("2026-08-01");
  });
});

describe("weekRangeLabel", () => {
  it("formats 'D. MMM — D. MMM' across the 7-day window in the given lang", () => {
    dayjs.locale("sr");
    const { weekStart } = createWeekNavState(dayjs("2026-05-13"));
    expect(weekRangeLabel(weekStart, "sr")).toBe("11. Maj — 17. Maj");
    expect(weekRangeLabel(weekStart, "en")).toBe("11. May — 17. May");
  });

  it("spans month boundaries", () => {
    dayjs.locale("sr");
    const { weekStart } = createWeekNavState(dayjs("2026-04-29"));
    expect(weekRangeLabel(weekStart, "sr")).toBe("27. Apr. — 3. Maj");
  });
});
