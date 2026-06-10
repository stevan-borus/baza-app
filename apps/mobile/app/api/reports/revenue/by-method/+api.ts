/**
 * Revenue grouped by PaymentMethod for the Prihod sub-page breakdown list.
 *
 * Only CONFIRMED BillingRecords contribute. Sorted by revenue descending so
 * cash/card (typically the biggest contributors) surface first.
 */
import type { ReportsRevenueByMethodResponse } from "@baza/types";
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
  const window = parseOptionalWindow(url.searchParams);
  if (window.kind === "invalid") {
    return fail("Invalid timeframe", 400);
  }
  const dateFilter =
    window.kind === "window"
      ? { createdAt: { gte: window.from, lt: window.to } }
      : {};

  const grouped = await prisma.billingRecord.groupBy({
    by: ["method"],
    where: {
      status: "CONFIRMED",
      ...dateFilter,
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const rows = sortedByMetricDesc(
    grouped.map((g) => ({
      method: g.method,
      revenue: g._sum.amount ?? 0,
      paymentCount: g._count.id,
    })),
    (row) => row.revenue,
  );

  return ok({ success: true, rows } satisfies ReportsRevenueByMethodResponse);
}
