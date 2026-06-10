/**
 * Week/month calendar-navigation state — shared by every calendar surface
 * (admin pregled, admin reservation-mode, client calendar, trainer
 * raspored, the notes SessionPicker).
 *
 * The same boundary-crossing math used to be copy-pasted into each screen.
 * The rules, in one place:
 *
 * - `selectedDate` is the focused day; picking a day inside the visible
 *   week must NEVER page the calendar (`weekStart` stays put).
 * - `weekStart` is owned by the week arrows — plus month-cell selection
 *   and deep-link jumps, which re-anchor the strip so the chosen day is
 *   in the visible week.
 * - `month` ("YYYY-MM", the availability query key) follows whichever
 *   anchor moved last, and only changes when a month boundary is crossed.
 * - `monthDate` (the month-view grid anchor) is owned by the month arrows
 *   and deep-link jumps; tapping a month cell does NOT move it.
 *
 * Pure functions first (dayjs in, plain values out) so the rules are
 * assertable in Vitest without a React tree; `useWeekNavigation` is a
 * trivial useState wrapper for the screens.
 */
import { useState } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";

// Idempotent — also registered app-wide in lib/i18n, but the pure math
// must work when this module is imported alone (unit tests).
dayjs.extend(weekday);

/**
 * Returns the start-of-week dayjs for the given date, using the active
 * dayjs locale to decide the first weekday (Mon for sr, Sun for en).
 *
 * The `weekday` plugin maps weekday(0) to the locale's first day. Strip
 * time-of-day to keep arithmetic stable across DST transitions.
 */
export function startOfLocaleWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  return d.weekday(0).startOf("day");
}

export type WeekNavState = {
  /** Focused day, "YYYY-MM-DD". */
  selectedDate: string;
  /** First day of the visible week (locale week start, startOf day). */
  weekStart: dayjs.Dayjs;
  /** "YYYY-MM" — drives `availabilityByMonth` query keys. */
  month: string;
  /** Month-view grid anchor (startOf month). */
  monthDate: dayjs.Dayjs;
};

export function createWeekNavState(anchor: dayjs.Dayjs): WeekNavState {
  return {
    selectedDate: anchor.format("YYYY-MM-DD"),
    weekStart: startOfLocaleWeek(anchor),
    month: monthKeyFromDate(anchor),
    monthDate: anchor.startOf("month"),
  };
}

export function monthKeyFromDate(d: dayjs.Dayjs): string {
  return d.format("YYYY-MM");
}

/**
 * Pick a day (week-strip tap). NEVER moves `weekStart` or `monthDate` —
 * picking a day inside the visible week must not page the calendar. The
 * query month follows only when the picked day crosses a month boundary.
 */
export function selectDay(state: WeekNavState, d: dayjs.Dayjs): WeekNavState {
  return {
    ...state,
    selectedDate: d.format("YYYY-MM-DD"),
    month: monthKeyFromDate(d),
  };
}

/**
 * Week arrows — page the strip by one week; `selectedDate` and `monthDate`
 * stay put. The query month follows the new WEEK START (not the week's
 * contents), so it only changes when the start crosses a month boundary.
 */
export function goToPreviousWeek(state: WeekNavState): WeekNavState {
  return pageWeek(state, -1);
}

export function goToNextWeek(state: WeekNavState): WeekNavState {
  return pageWeek(state, 1);
}

function pageWeek(state: WeekNavState, delta: 1 | -1): WeekNavState {
  const weekStart = state.weekStart.add(delta, "week");
  return { ...state, weekStart, month: monthKeyFromDate(weekStart) };
}

/**
 * Month arrows (month view) — page `monthDate` and the query month
 * together. `selectedDate` and `weekStart` stay where they are.
 */
export function goToPreviousMonth(state: WeekNavState): WeekNavState {
  return pageMonth(state, -1);
}

export function goToNextMonth(state: WeekNavState): WeekNavState {
  return pageMonth(state, 1);
}

function pageMonth(state: WeekNavState, delta: 1 | -1): WeekNavState {
  const monthDate = state.monthDate.add(delta, "month");
  return { ...state, monthDate, month: monthKeyFromDate(monthDate) };
}

/**
 * Tap a day cell in month view — select the date AND re-anchor the week
 * strip so the chosen day is in the visible week (the screens switch back
 * to day view right after). `monthDate` is owned by the month arrows and
 * deliberately stays put.
 */
export function selectMonthCell(state: WeekNavState, date: string): WeekNavState {
  const d = dayjs(date);
  return {
    ...state,
    selectedDate: date,
    weekStart: startOfLocaleWeek(d),
    month: monthKeyFromDate(d),
  };
}

/**
 * Deep-link jump (e.g. client calendar's `?date=`) — re-anchor ALL four
 * fields on the target day, month-view grid included.
 */
export function jumpToDate(_state: WeekNavState, d: dayjs.Dayjs): WeekNavState {
  return createWeekNavState(d);
}

/** The "11. Maj — 17. Maj" header above the week strip. */
export function weekRangeLabel(weekStart: dayjs.Dayjs, lang: string): string {
  return `${weekStart.locale(lang).format("D. MMM")} — ${weekStart
    .add(6, "day")
    .locale(lang)
    .format("D. MMM")}`;
}

/**
 * Thin useState wrapper for the screens — every transition above, bound.
 * `anchor` seeds the initial focus (the client calendar deep-links into a
 * specific day; everything else starts on today).
 */
export function useWeekNavigation(anchor?: dayjs.Dayjs) {
  const [state, setState] = useState<WeekNavState>(() =>
    createWeekNavState(anchor ?? dayjs()),
  );
  return {
    ...state,
    selectDay: (d: dayjs.Dayjs) => setState((s) => selectDay(s, d)),
    goToPreviousWeek: () => setState(goToPreviousWeek),
    goToNextWeek: () => setState(goToNextWeek),
    goToPreviousMonth: () => setState(goToPreviousMonth),
    goToNextMonth: () => setState(goToNextMonth),
    selectMonthCell: (date: string) => setState((s) => selectMonthCell(s, date)),
    jumpToDate: (d: dayjs.Dayjs) => setState((s) => jumpToDate(s, d)),
  };
}
