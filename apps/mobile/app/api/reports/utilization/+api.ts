import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { getReportBucketLabel, parseReportTimeframe } from "@/lib/server/reports";

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

  const seriesMap = new Map<string, { label: string; sessions: number; capacity: number; booked: number }>();
  for (const session of sessions) {
    const label = getReportBucketLabel(session.startsAt, timeframe.period);
    const existing = seriesMap.get(label) ?? {
      label,
      sessions: 0,
      capacity: 0,
      booked: 0,
    };
    existing.sessions += 1;
    existing.capacity += session.capacity;
    existing.booked += session._count.bookings;
    seriesMap.set(label, existing);
  }

  const data = [...seriesMap.values()].map((item) => ({
    period: item.label,
    totalCapacity: item.capacity,
    totalBooked: item.booked,
    utilization: item.capacity > 0 ? Number((item.booked / item.capacity).toFixed(4)) : 0,
  }));

  return ok({
    success: true,
    data,
  });
}
