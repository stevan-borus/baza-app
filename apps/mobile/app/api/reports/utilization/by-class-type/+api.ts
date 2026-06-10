import type { ReportsUtilizationByClassTypeResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  accumulateByKey,
  roundedRatio,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";
import { parseReportTimeframe } from "@/lib/server/reports";

/**
 * Utilization broken down per ClassType (Reformer, Energy, …) for the given
 * timeframe. Mirrors the by-room endpoint shape so the UI can render the
 * same row primitive — ProgressRing + name + booked/capacity ratio.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const timeframe = parseReportTimeframe(new URL(request.url).searchParams);
  if (!timeframe) {
    return fail("Invalid report timeframe", 400);
  }

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: timeframe.from, lt: timeframe.to },
      status: "SCHEDULED",
    },
    select: {
      capacity: true,
      classTypeId: true,
      classType: { select: { name: true } },
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
        },
      },
    },
  });

  const byClassType = accumulateByKey(
    sessions,
    (session) => session.classTypeId,
    (session) => ({
      classTypeId: session.classTypeId,
      name: session.classType?.name ?? "—",
      totalCapacity: 0,
      totalBooked: 0,
    }),
    (acc, session) => {
      acc.totalCapacity += session.capacity;
      acc.totalBooked += session._count.bookings;
    },
  );
  const data = sortedByMetricDesc(
    byClassType.map((row) => ({
      ...row,
      utilization: roundedRatio(row.totalBooked, row.totalCapacity),
    })),
    (row) => row.utilization,
  );

  return ok({ success: true, data } satisfies ReportsUtilizationByClassTypeResponse);
}
