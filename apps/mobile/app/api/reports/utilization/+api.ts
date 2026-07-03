import type { ReportsUtilizationResponse } from "@baza/types/reports";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulatePeriodSeries,
  roundedRatio,
} from "@/lib/server/report-aggregation";
import { parseReportTimeframe } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const timeframe = parseReportTimeframe(new URL(request.url).searchParams);
  if (!timeframe) {
    return fail("Invalid report timeframe", 400);
  }
  // Utilization = booked / capacity per bucket.
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: timeframe.from, lt: timeframe.to },
      status: "SCHEDULED",
    },
    select: {
      startsAt: true,
      capacity: true,
      _count: {
        select: {
          bookings: {
            where: { canceledAt: null },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const data = accumulatePeriodSeries(
    sessions,
    timeframe.period,
    (session) => session.startsAt,
    (label) => ({ period: label, totalCapacity: 0, totalBooked: 0, utilization: 0 }),
    (acc, session) => {
      acc.totalCapacity += session.capacity;
      acc.totalBooked += session._count.bookings;
    },
  );
  for (const item of data) {
    item.utilization = roundedRatio(item.totalBooked, item.totalCapacity);
  }

  return ok({
    success: true,
    data,
  } satisfies ReportsUtilizationResponse);
}
