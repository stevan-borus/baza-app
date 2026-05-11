/**
 * Revenue grouped by PaymentMethod for the Prihod sub-page breakdown list.
 *
 * Only CONFIRMED BillingRecords contribute. Sorted by revenue descending so
 * cash/card (typically the biggest contributors) surface first.
 */
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { parseDateInput } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  if (!from || !to || from >= to) {
    return fail("Invalid timeframe", 400);
  }

  const grouped = await prisma.billingRecord.groupBy({
    by: ["method"],
    where: {
      status: "CONFIRMED",
      createdAt: { gte: from, lt: to },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const rows = grouped
    .map((g) => ({
      method: g.method,
      revenue: g._sum.amount ?? 0,
      paymentCount: g._count.id,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return ok({ success: true, rows });
}
