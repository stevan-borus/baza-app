/**
 * Shared "period pill" state for the Izveštaji landing and sub-pages.
 *
 * Every Izveštaji surface uses the same Nedelja/Mesec/Kvartal/Godina pill +
 * the same from/to window math. Pulling it into one hook means the landing
 * and the Prihod sub-page can't drift, and adding the pill on a new
 * sub-page is one line.
 *
 * The window is anchored to the top of the current UTC day so the queryKey
 * is stable across renders. Without that anchor React Query refetched every
 * paint and the dev server logged hundreds of identical requests per second
 * (the same trap we hit on the landing in P3-1).
 */
import { useMemo, useState } from "react";

export type Period = "week" | "month" | "quarter" | "year";

export type PeriodWindow = {
  /** ISO string, inclusive lower bound. */
  from: string;
  /** ISO string, exclusive upper bound (tomorrow UTC midnight). */
  to: string;
};

export type PeriodPillState = {
  period: Period;
  setPeriod: (next: Period) => void;
  /** Both endpoints anchored to UTC midnight — see file header. */
  window: PeriodWindow;
};

export function usePeriodPill(initial: Period = "month"): PeriodPillState {
  const [period, setPeriod] = useState<Period>(initial);
  const window = useMemo<PeriodWindow>(() => {
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    if (period === "week") from.setUTCDate(to.getUTCDate() - 7);
    else if (period === "month") from.setUTCDate(to.getUTCDate() - 30);
    else if (period === "quarter") from.setUTCDate(to.getUTCDate() - 90);
    else from.setUTCFullYear(to.getUTCFullYear() - 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);
  return { period, setPeriod, window };
}
