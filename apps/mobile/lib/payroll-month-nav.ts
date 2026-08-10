import { now } from "@/lib/now";
import { STUDIO_TIMEZONE } from "@/lib/studio-time";

/**
 * The {year, month} a payroll screen opens on, and stepping between months.
 *
 * Payroll is settled after a month ends, so the default is the PREVIOUS month
 * — the one the owner is actually about to pay. Derived in the studio's
 * timezone so the boundary matches the server's own month range.
 */
export type PayrollMonthCursor = { year: number; month: number };

export function currentStudioMonth(): PayrollMonthCursor {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export function defaultPayrollMonth(): PayrollMonthCursor {
  return stepMonth(currentStudioMonth(), -1);
}

export function stepMonth(
  cursor: PayrollMonthCursor,
  delta: number,
): PayrollMonthCursor {
  const zeroBased = cursor.month - 1 + delta;
  const year = cursor.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { year, month };
}

/** "Jul 2026" in the active locale. */
export function formatMonthLabel(
  cursor: PayrollMonthCursor,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 15)));
}

/** A future month has no payroll to show. */
export function isFutureMonth(cursor: PayrollMonthCursor): boolean {
  const current = currentStudioMonth();
  return (
    cursor.year > current.year ||
    (cursor.year === current.year && cursor.month > current.month)
  );
}
