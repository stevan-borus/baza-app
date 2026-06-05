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
