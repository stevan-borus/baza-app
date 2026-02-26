import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  getReportBucketLabel,
  parseReportTimeframe,
} from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
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

  const seriesMap = new Map<
    string,
    { label: string; payments: number; revenue: number }
  >();
  for (const payment of payments) {
    const label = getReportBucketLabel(payment.createdAt, timeframe.period);
    const existing = seriesMap.get(label) ?? {
      label,
      payments: 0,
      revenue: 0,
    };
    existing.payments += 1;
    existing.revenue += payment.amount;
    seriesMap.set(label, existing);
  }
  const data = [...seriesMap.values()].map((item) => ({
    period: item.label,
    revenue: item.revenue,
    count: item.payments,
  }));

  return ok({
    success: true,
    data,
  });
}
