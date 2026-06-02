import { formatFullName } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
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

  const byTrainer = new Map<
    string,
    { trainerUserId: string; trainerName: string; capacity: number; booked: number }
  >();
  for (const session of sessions) {
    const existing = byTrainer.get(session.trainerUserId) ?? {
      trainerUserId: session.trainerUserId,
      trainerName: session.trainer
        ? formatFullName(session.trainer.firstName, session.trainer.lastName)
        : "—",
      capacity: 0,
      booked: 0,
    };
    existing.capacity += session.capacity;
    existing.booked += session._count.bookings;
    byTrainer.set(session.trainerUserId, existing);
  }

  const data = [...byTrainer.values()]
    .map((row) => ({
      trainerUserId: row.trainerUserId,
      trainerName: row.trainerName,
      totalCapacity: row.capacity,
      totalBooked: row.booked,
      utilization:
        row.capacity > 0 ? Number((row.booked / row.capacity).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);

  return ok({ success: true, data });
}
