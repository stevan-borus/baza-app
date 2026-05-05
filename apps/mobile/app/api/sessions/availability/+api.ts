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

  // Visibility rules:
  //   - Admin: sees everything (including hidden), so they can manage drafts.
  //   - Trainer (strict): sees only assigned + active (one-time) / active series.
  //   - Client: sees only active (one-time) and active series, AND only those
  //     class types the client has an eligible pack for at session.startsAt.
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

  // Class-scoped filter for clients: hide sessions whose classType the client
  // has no spendable pack for at session.startsAt. We evaluate per-session via
  // findEligibleClientPackage so all eligibility rules (pause window, future
  // startsAt, expiry extended by paused time, sessionsRemaining > 0) apply.
  let visibleSessions = sessions;
  if (guard.user.role === UserRole.CLIENT) {
    const clientProfileId = guard.user.clientProfile?.id;
    if (!clientProfileId) {
      // No profile -> no bookings possible -> empty list, not 404 — clients on
      // the calendar should see "no package" UX state.
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
      };
    }),
  });
}
