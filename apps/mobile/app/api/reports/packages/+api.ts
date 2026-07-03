import type { ReportsPackagesResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateByKey,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";
import { parseReportTimeframe } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const timeframe = parseReportTimeframe(new URL(request.url).searchParams);
  if (!timeframe) {
    return fail("Invalid report timeframe", 400);
  }

  const clientPackages = await prisma.clientPackage.findMany({
    where: { startsAt: { gte: timeframe.from, lt: timeframe.to } },
    select: {
      packageTypeId: true,
      startsAt: true,
      clientProfile: { select: { userId: true } },
      packageType: { select: { id: true, name: true } },
    },
  });

  // Most-used = count of ClientPackages per PackageType, sorted desc.
  const mostUsed = sortedByMetricDesc(
    accumulateByKey(
      clientPackages,
      (cp) => cp.packageTypeId,
      (cp) => ({
        packageTypeId: cp.packageTypeId,
        name: cp.packageType.name,
        count: 0,
      }),
      (acc) => {
        acc.count += 1;
      },
    ),
    (row) => row.count,
  );

  // Revenue per PackageType — now that BillingRecord has packageTypeId, this is a direct group-by.
  const billingRecords = await prisma.billingRecord.findMany({
    where: {
      createdAt: { gte: timeframe.from, lt: timeframe.to },
      status: "CONFIRMED",
      packageTypeId: { not: null },
    },
    select: {
      amount: true,
      packageTypeId: true,
      clientUserId: true,
      packageType: { select: { name: true } },
    },
  });
  const revenuePerType = sortedByMetricDesc(
    accumulateByKey(
      billingRecords,
      (br) => br.packageTypeId,
      (br) => ({
        packageTypeId: br.packageTypeId as string,
        name: br.packageType?.name ?? "",
        revenue: 0,
      }),
      (acc, br) => {
        acc.revenue += br.amount;
      },
    ),
    (row) => row.revenue,
  );

  // Comp vs paid: a ClientPackage is "paid" (Flow 1) if a BillingRecord with the same
  // (clientUserId, packageTypeId) exists; otherwise it's a comp / Poklon paket (Flow 2).
  const paidPairs = new Set(
    billingRecords.map((b) => `${b.clientUserId}:${b.packageTypeId}`),
  );
  let paid = 0;
  let comp = 0;
  for (const cp of clientPackages) {
    const key = `${cp.clientProfile.userId}:${cp.packageTypeId}`;
    if (paidPairs.has(key)) paid += 1;
    else comp += 1;
  }

  return ok({
    success: true,
    mostUsed,
    revenuePerType,
    compVsPaid: { paid, comp, total: paid + comp },
  } satisfies ReportsPackagesResponse);
}
