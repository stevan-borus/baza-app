import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
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

  const byRoom = new Map<
    string,
    { roomId: string; roomName: string; sessions: number; capacity: number; booked: number }
  >();
  for (const session of sessions) {
    if (!session.roomId) continue;
    const existing = byRoom.get(session.roomId) ?? {
      roomId: session.roomId,
      roomName: session.room?.name ?? "—",
      sessions: 0,
      capacity: 0,
      booked: 0,
    };
    existing.sessions += 1;
    existing.capacity += session.capacity;
    existing.booked += session._count.bookings;
    byRoom.set(session.roomId, existing);
  }

  const data = [...byRoom.values()]
    .map((row) => ({
      roomId: row.roomId,
      roomName: row.roomName,
      totalCapacity: row.capacity,
      totalBooked: row.booked,
      utilization:
        row.capacity > 0 ? Number((row.booked / row.capacity).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);

  return ok({ success: true, data });
}
