import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
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

  const byClassType = new Map<
    string,
    { classTypeId: string; name: string; capacity: number; booked: number }
  >();
  for (const session of sessions) {
    const existing = byClassType.get(session.classTypeId) ?? {
      classTypeId: session.classTypeId,
      name: session.classType?.name ?? "—",
      capacity: 0,
      booked: 0,
    };
    existing.capacity += session.capacity;
    existing.booked += session._count.bookings;
    byClassType.set(session.classTypeId, existing);
  }

  const data = [...byClassType.values()]
    .map((row) => ({
      classTypeId: row.classTypeId,
      name: row.name,
      totalCapacity: row.capacity,
      totalBooked: row.booked,
      utilization:
        row.capacity > 0 ? Number((row.booked / row.capacity).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);

  return ok({ success: true, data });
}
