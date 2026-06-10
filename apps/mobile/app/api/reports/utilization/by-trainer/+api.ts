import { formatFullName, type ReportsUtilizationByTrainerResponse } from "@baza/types";
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
 * Utilization broken down per trainer for the given timeframe. Trainers
 * with no sessions in window are omitted; sessions without an assigned
 * trainer are dropped.
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
      trainerUserId: true,
      trainer: { select: { firstName: true, lastName: true } },
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
        },
      },
    },
  });

  const byTrainer = accumulateByKey(
    sessions,
    (session) => session.trainerUserId,
    (session) => ({
      trainerUserId: session.trainerUserId,
      trainerName: session.trainer
        ? formatFullName(session.trainer.firstName, session.trainer.lastName)
        : "—",
      totalCapacity: 0,
      totalBooked: 0,
    }),
    (acc, session) => {
      acc.totalCapacity += session.capacity;
      acc.totalBooked += session._count.bookings;
    },
  );
  const data = sortedByMetricDesc(
    byTrainer.map((row) => ({
      ...row,
      utilization: roundedRatio(row.totalBooked, row.totalCapacity),
    })),
    (row) => row.utilization,
  );

  return ok({ success: true, data } satisfies ReportsUtilizationByTrainerResponse);
}
