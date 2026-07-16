import { reportsRevenueResponseSchema, type ReportsRevenueResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { accumulatePeriodSeries } from "@/lib/server/report-aggregation";
import { parseReportTimeframe } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const timeframe = parseReportTimeframe(new URL(request.url).searchParams);
  if (!timeframe) {
    return fail("Invalid report timeframe", 400);
  }

  const payments = await prisma.billingRecord.findMany({
    where: {
      createdAt: { gte: timeframe.from, lt: timeframe.to },
      status: "CONFIRMED",
    },
    select: {
      createdAt: true,
      amount: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const data = accumulatePeriodSeries(
    payments,
    timeframe.period,
    (payment) => payment.createdAt,
    (label) => ({ period: label, revenue: 0, count: 0 }),
    (acc, payment) => {
      acc.revenue += payment.amount;
      acc.count += 1;
    },
  );

  return respond(reportsRevenueResponseSchema, {
    success: true,
    data,
  } satisfies ReportsRevenueResponse);
}
