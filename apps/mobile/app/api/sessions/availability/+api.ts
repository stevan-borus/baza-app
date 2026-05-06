import { monthlyAvailabilityQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const parsed = monthlyAvailabilityQuerySchema.safeParse({ month });
  if (!parsed.success) return fail("Invalid month format. Use YYYY-MM", 400, parsed.error);

  const { start, end } = getMonthRange(parsed.data.month);

  // Admin sees hidden/draft sessions; trainer + client only see active.
  // Clients are additionally filtered by package eligibility further down.
  const isAdmin = guard.user.role === UserRole.ADMIN;
  const visibilityFilter = isAdmin
    ? {}
    : {
        AND: [
          {
            OR: [
              { recurringScheduleId: null, isActive: true },
              { recurringScheduleId: { not: null }, recurringSchedule: { isActive: true } },
            ],
          },
        ],
      };

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      status: "SCHEDULED",
      ...(guard.user.role === UserRole.TRAINER
        ? { trainerUserId: guard.user.id }
        : {}),
      ...visibilityFilter,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      isActive: true,
      roomId: true,
      classTypeId: true,
      trainerUserId: true,
      recurringScheduleId: true,
      classType: { select: { name: true } },
      room: { select: { name: true } },
      trainer: { select: { fullName: true } },
      recurringSchedule: { select: { isActive: true } },
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
          waitlist: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Attendance markers (post-cron): only for past sessions. The
  // SessionConsumption cron creates one row per active booking that found
  // an eligible package, so:
  //   consumedCount   → SessionConsumption rows for the session
  //   canceledCount   → bookings where canceledAt is set
  //   totalBookings   → all bookings (active + canceled)
  // Future sessions get `attendance: null` so the UI can omit the marker.
  const now = new Date();
  const pastSessionIds = sessions
    .filter((s: (typeof sessions)[number]) => s.endsAt < now)
    .map((s: (typeof sessions)[number]) => s.id);

  const attendanceBySessionId = new Map<
    string,
    { consumedCount: number; canceledCount: number; totalBookings: number }
  >();

  if (pastSessionIds.length > 0) {
    const [consumptions, allBookings] = await Promise.all([
      prisma.sessionConsumption.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: pastSessionIds } },
        _count: { _all: true },
      }),
      prisma.booking.findMany({
        where: { sessionId: { in: pastSessionIds } },
        select: { sessionId: true, canceledAt: true },
      }),
    ]);

    for (const id of pastSessionIds) {
      attendanceBySessionId.set(id, {
        consumedCount: 0,
        canceledCount: 0,
        totalBookings: 0,
      });
    }
    for (const row of consumptions) {
      const entry = attendanceBySessionId.get(row.sessionId);
      if (entry) entry.consumedCount = row._count._all;
    }
    for (const booking of allBookings) {
      const entry = attendanceBySessionId.get(booking.sessionId);
      if (!entry) continue;
      entry.totalBookings += 1;
      if (booking.canceledAt) entry.canceledCount += 1;
    }
  }

  let visibleSessions = sessions;
  if (guard.user.role === UserRole.CLIENT) {
    const clientProfileId = guard.user.clientProfile?.id;
    if (!clientProfileId) {
      // No profile means no bookings possible; render an empty calendar
      // rather than 404 so the "buy a package" UX state shows.
      visibleSessions = [];
    } else {
      const [clientPackages, packagePauses] = await Promise.all([
        prisma.clientPackage.findMany({
          where: { clientProfileId },
          select: {
            id: true,
            classTypeId: true,
            startsAt: true,
            expiresAt: true,
            sessionsRemaining: true,
          },
        }),
        prisma.packagePause.findMany({
          where: { clientProfileId },
          select: {
            startsAt: true,
            endsAt: true,
          },
        }),
      ]);

      visibleSessions = sessions.filter((session: (typeof sessions)[number]) =>
        Boolean(
          findEligibleClientPackage(
            clientPackages,
            packagePauses,
            session.startsAt,
            session.classTypeId,
          ),
        ),
      );
    }
  }

  return ok({
    success: true,
    month: parsed.data.month,
    sessions: visibleSessions.map((session: (typeof sessions)[number]) => {
      const seriesActive = session.recurringSchedule?.isActive ?? null;
      const visibleToClients = session.recurringScheduleId
        ? seriesActive === true
        : session.isActive;
      return {
        id: session.id,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        classTypeName: session.classType.name,
        roomId: session.roomId,
        roomName: session.room?.name ?? null,
        trainerUserId: session.trainerUserId,
        trainerName: session.trainer?.fullName ?? null,
        capacity: session.capacity,
        bookedCount: session._count.bookings,
        waitlistCount: session._count.waitlist,
        availableSlots: Math.max(session.capacity - session._count.bookings, 0),
        recurringScheduleId: session.recurringScheduleId,
        isActive: visibleToClients,
        attendance: attendanceBySessionId.get(session.id) ?? null,
      };
    }),
  });
}
