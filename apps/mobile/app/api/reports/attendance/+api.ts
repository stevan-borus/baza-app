import type { ReportsBookingsResponse } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { accumulatePeriodSeries } from "@/lib/server/report-aggregation";
import { parseReportTimeframe } from "@/lib/server/reports";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const timeframe = parseReportTimeframe(new URL(request.url).searchParams);
  if (!timeframe) {
    return fail("Invalid report timeframe", 400);
  }
  // Bucket sessions by period (day/week/month) for time-series aggregation.
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: timeframe.from, lt: timeframe.to },
      status: "SCHEDULED",
    },
    select: {
      startsAt: true,
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
    (label) => ({ period: label, bookings: 0 }),
    (acc, session) => {
      acc.bookings += session._count.bookings;
    },
  );

  return ok({
    success: true,
    data,
  } satisfies ReportsBookingsResponse);
}
