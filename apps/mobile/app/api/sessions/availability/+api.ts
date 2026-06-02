import { formatFullName, monthlyAvailabilityQuerySchema } from "@baza/types";
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
      trainer: { select: { firstName: true, lastName: true } },
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

  let visibleSessions = sessions;
  let myBookedSessionIds = new Set<string>();
  // Per-session late-cancel-hours pulled from the booking's package. Used
  // by the BookingSheet's cancel confirmation to warn the client when the
  // cancellation would consume a session.
  const myBookingLateCancelHours = new Map<string, number>();
  if (guard.user.role === UserRole.CLIENT) {
    const clientProfileId = guard.user.clientProfile?.id;
    if (!clientProfileId) {
      // No profile means no bookings possible; render an empty calendar
      // rather than 404 so the "buy a package" UX state shows.
      visibleSessions = [];
    } else {
      // Mark sessions the current client has an active booking on, so the
      // calendar/booking sheet can render the right state ("already booked").
      const myBookings = await prisma.booking.findMany({
        where: {
          clientProfileId,
          canceledAt: null,
          sessionId: { in: sessions.map((s) => s.id) },
        },
        select: {
          sessionId: true,
          clientPackage: { select: { lateCancelHours: true } },
        },
      });
      myBookedSessionIds = new Set(myBookings.map((b) => b.sessionId));
      for (const b of myBookings) {
        if (b.clientPackage?.lateCancelHours != null) {
          myBookingLateCancelHours.set(b.sessionId, b.clientPackage.lateCancelHours);
        }
      }

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
        trainerName: session.trainer
          ? formatFullName(session.trainer.firstName, session.trainer.lastName)
          : null,
        capacity: session.capacity,
        bookedCount: session._count.bookings,
        waitlistCount: session._count.waitlist,
        availableSlots: Math.max(session.capacity - session._count.bookings, 0),
        recurringScheduleId: session.recurringScheduleId,
        isActive: visibleToClients,
        isBookedByMe: myBookedSessionIds.has(session.id),
        lateCancelHours: myBookingLateCancelHours.get(session.id) ?? null,
      };
    }),
  });
}
