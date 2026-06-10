/**
 * Packages detail — the Paketi sub-page payload.
 *
 * One endpoint, four chunks: headline tiles (active / expiring soon /
 * consumption rate / sold in period), most-sold breakdown by PackageType,
 * paid-vs-comp split, and recent activations. Pulling all four from one
 * query window keeps tiles consistent and the UI's request count down.
 *
 * Definitions:
 *
 *  - **Active** is period-independent: every ClientPackage with
 *    `sessionsRemaining > 0 AND expiresAt > now`. This is the "live now"
 *    number — the most useful tile to read regardless of the period pill.
 *  - **Expiring soon** ⊂ Active where `expiresAt <= now + 14d`. Same
 *    period-independent semantics.
 *  - **Consumption rate** = average of `(sessionCount - sessionsRemaining)
 *    / sessionCount` across packages **started in [from, to)**. So this one
 *    IS period-dependent — it answers "for the cohort of packages started
 *    in this window, how far through them are people on average?"
 *  - **Sold in period** = count of ClientPackage rows where `startsAt ∈
 *    [from, to)`. Period-dependent.
 *
 * Paid-vs-comp uses the shared `linkPackagesToBilling` helper to keep this
 * surface and the per-client `/api/packages/client-packages` endpoint
 * classifying rows identically. Primary semantics are the explicit
 * `BillingRecord.clientPackageId` FK; legacy rows still pending backfill
 * fall back to the chronological-zip heuristic inside the same helper.
 * A match means "paid"; otherwise "comp". O(clients) DB queries for now —
 * optimization can come later if needed.
 */
import { formatFullName, type ReportsPackagesDetailResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import {
  linkPackagesToBilling,
  type BillingForMatch,
  type PackageForMatch,
} from "@/lib/server/billing-package-link";
import { fail, ok } from "@/lib/server/http";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateByKey,
  parseOptionalWindow,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_WINDOW_MS = 14 * DAY_MS;
const MOST_SOLD_LIMIT = 8;
const RECENT_ACTIVATIONS_LIMIT = 5;

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  // All-time pill omits both params — every period-dependent aggregate
  // (sold-in-period, consumption rate, most-sold, paid-vs-comp) then covers
  // every ClientPackage ever created. Active + expiring-soon are already
  // period-independent so they don't change.
  const window = parseOptionalWindow(url.searchParams);
  if (window.kind === "invalid") {
    return fail("Invalid timeframe", 400);
  }
  const dateFilter =
    window.kind === "window"
      ? { startsAt: { gte: window.from, lt: window.to } }
      : {};
  const currentInstant = now();
  const expiringSoonCutoff = new Date(
    currentInstant.getTime() + EXPIRING_SOON_WINDOW_MS,
  );

  // --- Active + expiring soon (period-independent) ----------------------
  const [activePackages, expiringSoonCount] = await Promise.all([
    prisma.clientPackage.count({
      where: {
        sessionsRemaining: { gt: 0 },
        expiresAt: { gt: currentInstant },
      },
    }),
    prisma.clientPackage.count({
      where: {
        sessionsRemaining: { gt: 0 },
        expiresAt: { gt: currentInstant, lte: expiringSoonCutoff },
      },
    }),
  ]);

  // --- Packages started in the window — drives the rest -----------------
  // We pull everything we need for sold-in-period, most-sold, consumption
  // rate, and paid-vs-comp from this one query.
  const periodPackages = await prisma.clientPackage.findMany({
    where: dateFilter,
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      packageTypeId: true,
      startsAt: true,
      sessionsRemaining: true,
      clientProfile: {
        select: {
          userId: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      packageType: {
        select: { id: true, name: true, sessionCount: true },
      },
    },
  });

  // --- Sold in period + consumption rate --------------------------------
  const soldInPeriod = periodPackages.length;
  let consumptionRate = 0;
  if (soldInPeriod > 0) {
    let totalRatio = 0;
    for (const pkg of periodPackages) {
      const sc = pkg.packageType.sessionCount;
      if (sc > 0) {
        const consumed = Math.max(0, sc - pkg.sessionsRemaining);
        totalRatio += consumed / sc;
      }
    }
    consumptionRate = totalRatio / soldInPeriod;
  }

  // --- Most-sold breakdown ----------------------------------------------
  const mostSold = sortedByMetricDesc(
    accumulateByKey(
      periodPackages,
      (pkg) => pkg.packageTypeId,
      (pkg) => ({
        packageTypeId: pkg.packageTypeId,
        packageTypeName: pkg.packageType.name,
        count: 0,
      }),
      (acc) => {
        acc.count += 1;
      },
    ),
    (row) => row.count,
    (a, b) => a.packageTypeName.localeCompare(b.packageTypeName),
  ).slice(0, MOST_SOLD_LIMIT);

  // --- Paid vs comp -----------------------------------------------------
  // Group the period packages by owning client (userId — BillingRecord
  // keys by clientUserId, not clientProfileId). For each client we fetch
  // ALL their confirmed package-tagged BillingRecords and run the zipping
  // helper against ALL of their ClientPackages (not just the period subset)
  // — otherwise an in-window package that pairs chronologically to an
  // out-of-window payment would look comp here but paid in the per-client
  // view. We then read off the in-window ids only.
  const packagesByClient = new Map<
    string,
    {
      inWindowIds: Set<string>;
      inWindowPackages: Array<PackageForMatch & { isRecentEnough: boolean }>;
    }
  >();
  for (const pkg of periodPackages) {
    const userId = pkg.clientProfile.userId;
    const bucket = packagesByClient.get(userId) ?? {
      inWindowIds: new Set<string>(),
      inWindowPackages: [],
    };
    bucket.inWindowIds.add(pkg.id);
    packagesByClient.set(userId, bucket);
  }

  const paidIds = new Set<string>();
  await Promise.all(
    Array.from(packagesByClient.entries()).map(async ([userId, bucket]) => {
      const [allPackages, billingRecords] = await Promise.all([
        prisma.clientPackage.findMany({
          where: { clientProfile: { userId } },
          select: { id: true, packageTypeId: true, startsAt: true },
        }),
        prisma.billingRecord.findMany({
          where: {
            clientUserId: userId,
            status: "CONFIRMED",
          },
          select: {
            id: true,
            amount: true,
            method: true,
            packageTypeId: true,
            clientPackageId: true,
            createdAt: true,
          },
        }),
      ]);
      const pkgInputs: PackageForMatch[] = allPackages.map((p) => ({
        id: p.id,
        packageTypeId: p.packageTypeId,
        startsAt: p.startsAt,
      }));
      const billingInputs: BillingForMatch[] = billingRecords.map((b) => ({
        id: b.id,
        amount: b.amount,
        method: b.method,
        packageTypeId: b.packageTypeId,
        clientPackageId: b.clientPackageId,
        createdAt: b.createdAt,
      }));
      const linkMap = linkPackagesToBilling(pkgInputs, billingInputs);
      for (const id of bucket.inWindowIds) {
        if (linkMap.has(id)) paidIds.add(id);
      }
    }),
  );

  const paid = paidIds.size;
  const comp = soldInPeriod - paid;

  // --- Recent activations -----------------------------------------------
  const recentActivations = periodPackages
    .slice(0, RECENT_ACTIVATIONS_LIMIT)
    .map((pkg) => ({
      clientPackageId: pkg.id,
      clientUserId: pkg.clientProfile.userId,
      clientFullName: formatFullName(
        pkg.clientProfile.user.firstName,
        pkg.clientProfile.user.lastName,
      ),
      packageTypeName: pkg.packageType.name,
      startsAt: pkg.startsAt.toISOString(),
      isPaid: paidIds.has(pkg.id),
    }));

  return ok({
    success: true,
    headline: {
      activePackages,
      expiringSoon: expiringSoonCount,
      consumptionRate: Number(consumptionRate.toFixed(4)),
      soldInPeriod,
    },
    mostSold,
    compVsPaid: { paid, comp },
    recentActivations,
  } satisfies ReportsPackagesDetailResponse);
}
