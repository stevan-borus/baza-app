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
