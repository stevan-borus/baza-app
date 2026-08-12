/**
 * The one place a package's "y" in "x/y" is computed.
 *
 * `sessionsGranted` is what the package actually handed over — the SKU's count
 * for a paid assign, or the (smaller) gift count when a real package is gifted.
 * Reading the SKU's live `sessionCount` instead would render a 1-session gift
 * on a 12-session SKU as "1/12".
 *
 * `bonusSessions` is the snapshotted "+1 termin" grant, which grows the total
 * rather than pushing the remaining count past it (#133: an unused 12/12 plus a
 * grant reads 13/13, not 13/12).
 */
export function packageSessionsTotal(pkg: {
  sessionsGranted: number;
  bonusSessions: number;
}): number {
  return pkg.sessionsGranted + pkg.bonusSessions;
}
