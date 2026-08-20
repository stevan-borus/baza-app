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
 * Those calendar boundaries are STUDIO boundaries: 05:00 Belgrade, the same
 * opening hour packages and payroll already use. They used to be UTC midnight,
 * which meant "Mesec" named two different windows depending on where you
 * stood — the dashboard revenue hero counted a studio month while these
 * report pills counted a UTC one, so a payment taken between midnight and
 * opening on the 1st was in last month here and this month there. The
 * boundary follows the business day, not the server's clock.
 *
 * Which period an instant belongs to is likewise decided by the STUDIO DAY
 * containing it, not by the raw UTC date: at 02:00 Belgrade on the 1st the
 * studio is shut and the outgoing period has not closed, so that instant
 * still reports the closing period.
 *
 * The endpoints are period boundaries rather than "now", so the queryKey is
 * stable across renders. Without that anchor React Query refetched every
 * paint and the dev server logged hundreds of identical requests per second
 * (the same trap we hit on the landing in P3-1).
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
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { now } from "@/lib/now";
import { studioMonthRange } from "@/lib/payroll-valuation";
import { STUDIO_TIMEZONE, startOfStudioDay } from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

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
  /** Both endpoints anchored to the studio day boundary — see file header. */
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

  // Read the calendar off the studio DAY containing the anchor, so an
  // instant before opening still belongs to the period that is closing.
  const day = dayjs(startOfStudioDay(anchor)).tz(STUDIO_TIMEZONE);
  const year = day.year();
  // dayjs months are 0-indexed; `studioMonthRange` takes them 1-indexed.
  const month = day.month() + 1;

  const spanMonths = period === "month" ? 1 : period === "quarter" ? 3 : 12;
  const startMonth =
    period === "month"
      ? month
      : period === "quarter"
        ? Math.floor((month - 1) / 3) * 3 + 1
        : 1;

  // A period is a run of whole studio months: it opens when its first month
  // opens and closes when the month AFTER its last one opens. Both endpoints
  // go through `studioMonthRange` from their own year/month, so each resolves
  // the Belgrade offset for its own date — a period crossing a DST change has
  // 05:00 openings at both ends even though they are different UTC instants.
  const { from } = studioMonthRange(year, startMonth);
  const endMonthIndex = startMonth - 1 + spanMonths;
  const { from: to } = studioMonthRange(
    year + Math.floor(endMonthIndex / 12),
    (endMonthIndex % 12) + 1,
  );
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
