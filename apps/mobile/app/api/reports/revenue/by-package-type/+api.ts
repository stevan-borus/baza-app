/**
 * Revenue grouped by PackageType for the Prihod sub-page breakdown list.
 *
 * Only CONFIRMED BillingRecords with `packageTypeId IS NOT NULL` contribute
 * — anonymous (no package) and pending/canceled rows are dropped. Sorted by
 * revenue descending so the highest-grossing package surfaces first.
 *
 * The aggregation runs in two queries: a Prisma `groupBy` for the totals and
 * a single `findMany` to resolve PackageType names. Splitting avoids a join
 * Prisma can't express through groupBy and keeps the index path (createdAt,
 * status, packageTypeId) clean.
 */
import type { ReportsRevenueByPackageTypeResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  parseOptionalWindow,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  // All-time pill omits both params — drop the createdAt filter entirely.
  // A one-sided window is still treated as a client bug → 400.
  const window = parseOptionalWindow(url.searchParams);
  if (window.kind === "invalid") {
    return fail("Invalid timeframe", 400);
  }
  const dateFilter =
    window.kind === "window"
      ? { createdAt: { gte: window.from, lt: window.to } }
      : {};

  const grouped = await prisma.billingRecord.groupBy({
    by: ["packageTypeId"],
    where: {
      status: "CONFIRMED",
      ...dateFilter,
      packageTypeId: { not: null },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const ids = grouped
    .map((g) => g.packageTypeId)
    .filter((id): id is string => typeof id === "string");
  const packageTypes = ids.length
    ? await prisma.packageType.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(packageTypes.map((p) => [p.id, p.name]));

  const rows = sortedByMetricDesc(
    grouped.map((g) => ({
      packageTypeId: g.packageTypeId as string,
      packageTypeName: nameById.get(g.packageTypeId as string) ?? "—",
      revenue: g._sum.amount ?? 0,
      paymentCount: g._count.id,
    })),
    (row) => row.revenue,
  );

  return ok({ success: true, rows } satisfies ReportsRevenueByPackageTypeResponse);
}
