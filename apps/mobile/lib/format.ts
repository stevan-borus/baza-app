/**
 * Currency formatting shared across admin + client surfaces.
 *
 * RSD has no minor unit in practice — amounts are whole dinars. We render
 * `12.000 RSD` (sr-RS thousands-grouping + a literal suffix) everywhere so the
 * client "Moji paketi" timeline and admin Naplata/Izveštaji agree to the glyph.
 * Deliberately NOT Intl.NumberFormat(style:"currency"): that keys the symbol
 * placement off the UI language, so an en client would see a different glyph
 * than an sr client for the same amount.
 */
export function formatRsd(n: number): string {
  return `${Math.round(n).toLocaleString("sr-RS")} RSD`;
}

/**
 * Period-range label shared by the Naplata drill header and every Izveštaji
 * sub-page. `toExclusive` is an exclusive upper bound (the API returns
 * half-open windows), so we display the last INCLUDED instant — `toExclusive`
 * minus 1ms — as the range end.
 *
 * The year is shown only when the range crosses a calendar-year boundary:
 * otherwise a single-year window like "13. maj – 13. maj" on the Godina period
 * would read as the same day with no way to tell the two endpoints apart. The
 * boundary check uses UTC years to stay stable regardless of the viewer's
 * timezone. `locale` is passed straight to `toLocaleDateString`, so callers
 * keep whatever locale string they already use (e.g. `sr-RS` vs `sr-Latn-RS`).
 */
export function formatDateRange(
  from: string | number | Date,
  toExclusive: string | number | Date,
  locale: string,
): string {
  const fromD = new Date(from);
  const inclusiveTo = new Date(new Date(toExclusive).getTime() - 1);
  const crossesYear =
    fromD.getUTCFullYear() !== inclusiveTo.getUTCFullYear();
  const fmt: Intl.DateTimeFormatOptions = crossesYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" };
  return `${fromD.toLocaleDateString(locale, fmt)} – ${inclusiveTo.toLocaleDateString(locale, fmt)}`;
}

/**
 * Share of the client directory that's active, as a whole-number percent.
 *
 * Returns `undefined` when there's no directory to rate (zero/negative
 * denominator) so the caller renders the "—" placeholder instead of the old
 * `NaN%` — an empty studio has no attendance rate, not a broken one.
 */
export function activeClientRate(
  activeClients: number,
  totalClients: number,
): number | undefined {
  if (totalClients <= 0) return undefined;
  return Math.round((activeClients / totalClients) * 100);
}
