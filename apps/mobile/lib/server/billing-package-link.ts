/**
 * Pair ClientPackage rows with the BillingRecord that funded them.
 *
 * As of the BillingRecord.clientPackageId FK migration the source of truth
 * for new paid activations is the explicit FK: every row written via the
 * `activatePackageOnConfirm: true` transaction in POST /api/billing lands
 * with `clientPackageId` populated. The `@unique` constraint on that column
 * enforces the 1:1 invariant — one payment funds at most one package.
 *
 * Two helpers live here:
 *
 *   - `linkPackagesToBilling` (preferred). Builds the link map from the FK
 *     in a single pass, then falls back to the legacy chronological-zip
 *     heuristic only for the leftover packages whose paired billing row
 *     pre-dates the backfill and is still NULL.
 *
 *   - `matchBillingToPackages` (legacy, kept exported). Tuple-zip by
 *     `(packageTypeId, chronological order)` for the same-typed packages
 *     and confirmed payments. Useful indefinitely as the fallback inside
 *     `linkPackagesToBilling` and for any code path that still hasn't been
 *     migrated to read the FK.
 *
 * Used by:
 *   - `app/api/packages/client-packages/+api.ts` (per-client list, surfaces
 *     `billingRecord` on each row so the client UI can show "Plaćeno · CARD").
 *   - `app/api/reports/packages/detail/+api.ts` (paid-vs-comp split on the
 *     Izveštaji → Paketi sub-page).
 *
 * Keeping both call sites pointed at this one helper prevents the two surfaces
 * from drifting apart — the comp-vs-paid breakdown and the per-client "paid?"
 * tag now classify a row identically.
 */

export type PackageForMatch = {
  id: string;
  packageTypeId: string;
  startsAt: Date;
};

export type BillingForMatch = {
  id: string;
  amount: number;
  method: string;
  packageTypeId: string | null;
  clientPackageId?: string | null;
  createdAt: Date;
};

/**
 * Build a map ClientPackage.id → matching BillingRecord by zipping packages
 * and records of each PackageType in chronological order. Packages without a
 * matched record are simply absent from the map (caller treats those as
 * comp / gift).
 */
export function matchBillingToPackages(
  packages: PackageForMatch[],
  billingRecords: BillingForMatch[],
): Map<string, BillingForMatch> {
  const packagesByType = new Map<string, PackageForMatch[]>();
  for (const p of packages) {
    const list = packagesByType.get(p.packageTypeId) ?? [];
    list.push(p);
    packagesByType.set(p.packageTypeId, list);
  }
  const billingByType = new Map<string, BillingForMatch[]>();
  for (const b of billingRecords) {
    if (!b.packageTypeId) continue;
    const list = billingByType.get(b.packageTypeId) ?? [];
    list.push(b);
    billingByType.set(b.packageTypeId, list);
  }

  const linkMap = new Map<string, BillingForMatch>();
  for (const [typeId, pkgs] of packagesByType) {
    const sortedPkgs = [...pkgs].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
    const records = [...(billingByType.get(typeId) ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    sortedPkgs.forEach((p, i) => {
      const match = records[i];
      if (match) linkMap.set(p.id, match);
    });
  }
  return linkMap;
}

/**
 * Preferred package→billing matcher.
 *
 * Walks `billingRecords` once and indexes by `clientPackageId` — every row
 * with the FK set lands in the map immediately. Any package that didn't
 * pick up a match from the FK pass is handed to `matchBillingToPackages`
 * along with the still-unclaimed billing rows; this preserves correct
 * pairings for legacy data that pre-dates the backfill.
 *
 * Drop-in replacement for `matchBillingToPackages` — same return shape.
 */
export function linkPackagesToBilling(
  packages: PackageForMatch[],
  billingRecords: BillingForMatch[],
): Map<string, BillingForMatch> {
  const linkMap = new Map<string, BillingForMatch>();
  const claimedBillingIds = new Set<string>();

  // FK pass — index by clientPackageId.
  const billingByPackageId = new Map<string, BillingForMatch>();
  for (const b of billingRecords) {
    if (b.clientPackageId) billingByPackageId.set(b.clientPackageId, b);
  }
  const stillPendingPackages: PackageForMatch[] = [];
  for (const p of packages) {
    const fkMatch = billingByPackageId.get(p.id);
    if (fkMatch) {
      linkMap.set(p.id, fkMatch);
      claimedBillingIds.add(fkMatch.id);
    } else {
      stillPendingPackages.push(p);
    }
  }

  if (stillPendingPackages.length === 0) return linkMap;

  // Fallback pass — exclude already-claimed billing rows so the chronological
  // zip doesn't double-assign.
  const fallbackBilling = billingRecords.filter((b) => !claimedBillingIds.has(b.id));
  const fallbackMap = matchBillingToPackages(stillPendingPackages, fallbackBilling);
  for (const [pkgId, billing] of fallbackMap) linkMap.set(pkgId, billing);
  return linkMap;
}
