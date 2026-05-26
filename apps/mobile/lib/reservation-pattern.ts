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

export function expandPattern(
  sessions: SessionForPattern[],
  input: PatternInput,
): Set<string> {
  const out = new Set<string>();
  const start = input.rangeStart.startOf("day");
  const end = start.add(input.weeks, "week").endOf("day");
  for (const s of sessions) {
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
