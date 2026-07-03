/**
 * Shared "period pill" state for the Izveštaji landing and sub-pages.
 *
 * Every Izveštaji surface uses the same Mesec/Kvartal/Godina/Sve pill + the
 * same from/to window math. Pulling it into one hook means the landing and
 * the Prihod sub-page can't drift, and adding the pill on a new sub-page
 * is one line.
 *
 * Windows are CALENDAR-aligned (not rolling): "Mesec" = the current calendar
 * month (1st through end-of-month), "Kvartal" = the current quarter, "Godina"
 * = the current year. `to` is the START of the next period (exclusive upper
 * bound), so SCHEDULED sessions later in the current period are naturally
 * included — that's important for the iskorišćenost screen, which would
 * otherwise read "0%" early in a month because all the sessions sit in the
 * future half of the window.
 *
 * The window is anchored to UTC midnight at the period boundaries so the
 * queryKey is stable across renders. Without that anchor React Query
 * refetched every paint and the dev server logged hundreds of identical
 * requests per second (the same trap we hit on the landing in P3-1).
 *
 * "Nedelja" (week) was dropped from the pill in PR γ — at iPhone narrow
 * widths the five segments wrapped to two lines and the design intent
 * (one-line, equal-width pills) broke. Month is the shortest window.
 *
 * When `period === "all"`, `from` and `to` are `undefined` — consumers omit
 * the query params and the server drops the time filter / switches the
 * time-series endpoints to yearly buckets (see ADR/comments in the report
 * endpoints).
 */
import { useMemo, useState } from "react";
import { now } from "@/lib/now";

export type Period = "month" | "quarter" | "year" | "all";

export type PeriodWindow = {
  /** ISO string, inclusive lower bound. `undefined` when period="all". */
  from: string | undefined;
  /** ISO string, exclusive upper bound (start of the next period). `undefined` when period="all". */
  to: string | undefined;
};

export type PeriodPillState = {
  period: Period;
  setPeriod: (next: Period) => void;
  /** Both endpoints anchored to UTC midnight — see file header. */
  window: PeriodWindow;
};

/**
 * Pure window math. Exported so unit tests can pin an anchor instant
 * without rendering the hook + faking timers.
 */
export function computePeriodWindow(
  period: Period,
  anchor: Date,
): PeriodWindow {
  if (period === "all") {
    return { from: undefined, to: undefined };
  }
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  let from: Date;
  let to: Date;
  if (period === "month") {
    from = new Date(Date.UTC(y, m, 1));
    to = new Date(Date.UTC(y, m + 1, 1));
  } else if (period === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    from = new Date(Date.UTC(y, qStart, 1));
    to = new Date(Date.UTC(y, qStart + 3, 1));
  } else {
    from = new Date(Date.UTC(y, 0, 1));
    to = new Date(Date.UTC(y + 1, 0, 1));
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function usePeriodPill(initial: Period = "month"): PeriodPillState {
  const [period, setPeriod] = useState<Period>(initial);
  const window = useMemo<PeriodWindow>(
    () => computePeriodWindow(period, now()),
    [period],
  );
  return { period, setPeriod, window };
}
