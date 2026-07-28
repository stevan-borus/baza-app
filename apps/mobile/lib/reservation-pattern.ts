/**
 * Pure logic for expanding a reservation pattern into the matching set of
 * existing session IDs. Lives outside the component so it can be tested
 * without a React tree.
 *
 * Rhythm:
 *   - "weekly"   — Week A is applied to every week in [rangeStart, rangeEnd].
 *   - "biweekly" — Week A on even week-offsets from rangeStart, Week B on odd.
 *
 * "Week-offset" is `floor((sessionDate - rangeStart) / 7 days)`. Week A is
 * anchored to the start week; the admin can't toggle it — they reframe by
 * shifting the start date.
 */
import dayjs from "dayjs";
import { nowMs } from "@/lib/now";

export type RhythmWeek = {
  weekdays: number[]; // 0=Mon .. 6=Sun
  timeOfDayMins: number; // minutes since midnight, local time
};

export type PatternInput = {
  rhythm: "weekly" | "biweekly";
  weekA: RhythmWeek;
  weekB: RhythmWeek;
  // Number of calendar weeks from rangeStart that the pattern covers.
  weeks: number;
  // ISO date or dayjs — the day the pattern starts being applied.
  // Defaults to "today" on the caller.
  rangeStart: dayjs.Dayjs;
};

export type SessionForPattern = {
  id: string;
  startsAt: Date;
};

/**
 * Every "YYYY-MM" availability key the pattern's date range touches, ascending.
 *
 * The screen's calendar only ever loads ONE month of availability, so a
 * pattern started near month end used to have nothing but that month's
 * leftovers to match against — "12 weeks" selected 2 sessions instead of 15+.
 * The caller fetches each of these months before expanding.
 *
 * Uses the same `dayjs.format("YYYY-MM")` shape as
 * `use-week-navigation.ts:monthKeyFromDate`, which is what
 * `sessionsQueries.availabilityByMonth` is keyed on.
 */
export function monthKeysForPattern(input: PatternInput): string[] {
  const start = input.rangeStart.startOf("day");
  const end = patternRangeEnd(input);
  const keys: string[] = [];
  let cursor = start.startOf("month");
  while (!cursor.isAfter(end, "month")) {
    keys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return keys;
}

/** Last instant the pattern can match — shared by expansion and month keys. */
function patternRangeEnd(input: PatternInput): dayjs.Dayjs {
  return input.rangeStart.startOf("day").add(input.weeks, "week").endOf("day");
}

export function expandPattern(
  sessions: SessionForPattern[],
  input: PatternInput,
): Set<string> {
  const out = new Set<string>();
  const start = input.rangeStart.startOf("day");
  const end = patternRangeEnd(input);
  // Sessions whose startsAt is already in the past are never matched —
  // booking a past session has no real meaning and the UI's per-card
  // `disabled` state already prevents manual selection. The pattern
  // expansion has to mirror that or admins would see "10 matched" but
  // only 7 actually selectable cards.
  const nowInstant = nowMs();
  for (const s of sessions) {
    if (s.startsAt.getTime() < nowInstant) continue;
    const d = dayjs(s.startsAt);
    if (d.isBefore(start, "day") || d.isAfter(end, "day")) continue;
    const dow = (d.day() + 6) % 7; // convert Sun=0 → Mon=0
    const weekOffset = Math.floor(d.diff(start, "day") / 7);
    const useB = input.rhythm === "biweekly" && weekOffset % 2 === 1;
    const wk = useB ? input.weekB : input.weekA;
    if (!wk.weekdays.includes(dow)) continue;
    const tod = d.hour() * 60 + d.minute();
    if (tod !== wk.timeOfDayMins) continue;
    out.add(s.id);
  }
  return out;
}
