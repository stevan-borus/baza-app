import type { ReportsUtilizationByRoomResponse } from "@baza/types/reports";
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
 * Utilization broken down per StudioRoom for the given timeframe.
 *
 * Returns one row per room: `(roomId, roomName, totalCapacity, totalBooked, utilization)`.
 * Rows are sorted by utilization descending so the busiest rooms surface first.
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
      roomId: { not: null },
    },
    select: {
      capacity: true,
      roomId: true,
      room: { select: { name: true } },
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
        },
      },
    },
  });

  const byRoom = accumulateByKey(
    sessions,
    (session) => session.roomId,
    (session) => ({
      roomId: session.roomId as string,
      roomName: session.room?.name ?? "—",
      totalCapacity: 0,
      totalBooked: 0,
    }),
    (acc, session) => {
      acc.totalCapacity += session.capacity;
      acc.totalBooked += session._count.bookings;
    },
  );
  const data = sortedByMetricDesc(
    byRoom.map((row) => ({
      ...row,
      utilization: roundedRatio(row.totalBooked, row.totalCapacity),
    })),
    (row) => row.utilization,
  );

  return ok({ success: true, data } satisfies ReportsUtilizationByRoomResponse);
}
