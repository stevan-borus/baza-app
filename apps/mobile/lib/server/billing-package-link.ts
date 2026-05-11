/**
 * Pair ClientPackage rows with the BillingRecord that funded them.
 *
 * There is no FK from BillingRecord → ClientPackage (P2-5 decision —
 * BillingRecord only links to PackageType so it can keep working when a
 * package is voided or re-issued). To reconstruct the link at query time we
 * match by tuple `(packageType, chronological order)`:
 *
 *   1. Bucket both arrays by `packageTypeId`.
 *   2. Within each bucket, sort packages ASC by `startsAt` and confirmed
 *      billing records ASC by `createdAt`.
 *   3. Zip the two lists by index: the i-th package of a given type pairs
 *      with the i-th confirmed payment of that type.
 *
 * Extras on either side are dropped. A ClientPackage with no match is a comp
 * / gift; a BillingRecord with no match represents a payment whose package
 * hasn't been issued yet (rare, but possible if a refund-then-reissue race
 * happens).
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
