import { formatFullName } from "@baza/types/common";
import {
  availabilityResponseSchema,
  monthlyAvailabilityQuerySchema,
} from "@baza/types/scheduling";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { countHeldSessions } from "@/lib/server/booking-hold-count";
import { respond, fail } from "@/lib/server/http";
import {
  classifyRenewalLockReason,
  clientOwnsPackageForClass,
  ELIGIBILITY_PACKAGE_SELECT,
  findEligibleClientPackage,
  toEligibilityPackage,
} from "@/lib/server/package-eligibility";
import { canHoldAnotherBooking, isLastBookableSlot } from "@/lib/server/package-hold";
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
      isAdvanced: true,
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
  let myWaitlistedSessionIds = new Set<string>();
  // CLIENT-only per-session booking flags. Staff sessions default to
  // bookable (no entry in the map). Keyed by session id.
  const sessionBookingFlags = new Map<
    string,
    {
      bookable: boolean;
      lockReason?: "RENEW" | "PAUSED" | "NOT_STARTED" | "FULLY_HELD";
      lastBookableSlot: boolean;
    }
  >();
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

      // Sessions this client is waitlisted on — drives the sheet's "leave
      // waitlist" state so a waitlisted client sees a leave button, not a join.
      const myWaitlist = await prisma.waitlistEntry.findMany({
        where: {
          clientProfileId,
          sessionId: { in: sessions.map((s) => s.id) },
        },
        select: { sessionId: true },
      });
      myWaitlistedSessionIds = new Set(myWaitlist.map((w) => w.sessionId));

      const [clientPackageRows, packagePauses] = await Promise.all([
        prisma.clientPackage.findMany({
          where: { clientProfileId },
          select: ELIGIBILITY_PACKAGE_SELECT,
        }),
        prisma.packagePause.findMany({
          where: { clientProfileId },
          select: {
            startsAt: true,
            endsAt: true,
          },
        }),
      ]);
      const clientPackages = clientPackageRows.map(toEligibilityPackage);

      // Visibility: any session of a class the client has EVER owned a pack
      // for stays on the calendar — lapsed clients see a greyed-out schedule
      // with a renewal CTA instead of an unexplained blank. Classes they
      // never bought stay hidden (keeps fenced class types invisible; a mix
      // package makes every covered class type visible).
      visibleSessions = sessions.filter((session: (typeof sessions)[number]) =>
        clientOwnsPackageForClass(clientPackages, session.classTypeId),
      );

      // Bookability + last-slot flag per session. Held-slot counts are
      // memoized per package: a month of sessions typically resolves to the
      // same one or two packages.
      const heldCountByPackageId = new Map<string, number>();
      const at = now();
      for (const session of visibleSessions) {
        const eligible = findEligibleClientPackage(
          clientPackages,
          packagePauses,
          session.startsAt,
          session.classTypeId,
        );
        if (!eligible) {
          // Owned but no eligible pack — classify the real cause so the UI can
          // say the truthful thing: PAUSED (paused on purpose) / NOT_STARTED
          // (pack starts later) / RENEW (expired or used up).
          sessionBookingFlags.set(session.id, {
            bookable: false,
            lockReason: classifyRenewalLockReason(
              clientPackages,
              packagePauses,
              at,
              session.classTypeId,
            ),
            lastBookableSlot: false,
          });
          continue;
        }
        let heldCount = heldCountByPackageId.get(eligible.id);
        if (heldCount === undefined) {
          heldCount = await countHeldSessions(prisma, {
            clientProfileId,
            classTypeIds: eligible.classTypeIds,
            clientPackageId: eligible.id,
            at,
          });
          heldCountByPackageId.set(eligible.id, heldCount);
        }
        // Eligible on paper, but every remaining session is already committed
        // to a future booking/waitlist hold — the book call would 409. Mark it
        // locked with its own reason so the UI can explain (the pilot incident:
        // a client at her hold limit saw normal bookable rows, got rejected,
        // and had no idea why).
        if (
          !canHoldAnotherBooking({
            sessionsRemaining: eligible.sessionsRemaining,
            heldCount,
          })
        ) {
          sessionBookingFlags.set(session.id, {
            bookable: false,
            lockReason: "FULLY_HELD",
            lastBookableSlot: false,
          });
          continue;
        }
        sessionBookingFlags.set(session.id, {
          bookable: true,
          lastBookableSlot: isLastBookableSlot({
            sessionsRemaining: eligible.sessionsRemaining,
            heldCount,
          }),
        });
      }
    }
  }

  return respond(availabilityResponseSchema, {
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
        isAdvanced: session.isAdvanced,
        recurringScheduleId: session.recurringScheduleId,
        isActive: visibleToClients,
        isBookedByMe: myBookedSessionIds.has(session.id),
        isWaitlistedByMe: myWaitlistedSessionIds.has(session.id),
        lateCancelHours: myBookingLateCancelHours.get(session.id) ?? null,
        // Staff (no map entry) are always bookable and never warned.
        bookable: sessionBookingFlags.get(session.id)?.bookable ?? true,
        lockReason: sessionBookingFlags.get(session.id)?.lockReason,
        lastBookableSlot:
          sessionBookingFlags.get(session.id)?.lastBookableSlot ?? false,
      };
    }),
  });
}
