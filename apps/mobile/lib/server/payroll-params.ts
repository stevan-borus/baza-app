/**
 * Payroll routes are always addressed by a calendar year + month, never a free
 * date range: a payout period IS a month, and accepting arbitrary ranges would
 * invite payouts that no period can lock.
 */
export function parsePayrollMonthParams(
  searchParams: URLSearchParams,
): { year: number; month: number } | null {
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}
