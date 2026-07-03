import { bookingMutationInputSchema, BOOKING_ERRORS } from "@baza/types/bookings";
import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import {
  applyLateCancelForfeit,
  promoteNextWaitlistEntry,
} from "@/lib/server/booking-cancellation";
import { fail, ok } from "@/lib/server/http";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import { notifyClient } from "@/lib/server/notify-client";
import { notifyOperators } from "@/lib/server/notify-operators";
import { countHeldSessions } from "@/lib/server/booking-hold-count";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { canHoldAnotherBooking } from "@/lib/server/package-hold";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = bookingMutationInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const { action, sessionId } = parsed.data;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      status: true,
      classTypeId: true,
      trainerUserId: true,
      classType: { select: { name: true } },
    },
  });
  if (!session || session.status !== "SCHEDULED")
    return fail("Session not available", 404);

  if (action === "BOOK") {
    // Can't book a session that has already started/passed. CANCEL is exempt —
    // a client may still need to undo a booking on a past session.
    if (session.startsAt.getTime() <= now().getTime()) {
      return fail(BOOKING_ERRORS.SESSION_IN_PAST, 409);
    }

    // Block bookings for unverified minors AFTER their first completed session.
    // First booking goes through so the studio can collect the paper waiver in person.
    const consentStatus = await getConsentStatus(guard.user.id);
    if (consentStatus.guardianVerificationNeeded) {
      return fail(BOOKING_ERRORS.GUARDIAN_VERIFICATION_REQUIRED, 409);
    }

    const [clientPackages, packagePauses] = await Promise.all([
      prisma.clientPackage.findMany({
        where: { clientProfileId, classTypeId: session.classTypeId },
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

    const eligiblePackage = findEligibleClientPackage(
      clientPackages,
      packagePauses,
      session.startsAt,
      session.classTypeId,
    );

    if (!eligiblePackage) {
      return fail("no_package_for_class", 409);
    }

    const hasBooking = await prisma.booking.findUnique({
      where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
    });
    // Idempotent: already booked is success, not an error.
    if (hasBooking && !hasBooking.canceledAt)
      return ok({ success: true, state: "BOOKED_ALREADY" });

    // Count holds + create the booking/waitlist atomically so two concurrent
    // requests can't both pass the overuse check on the last remaining session.
    const result = await prisma.$transaction(async (tx) => {
      const heldCount = await countHeldSessions(tx, {
        clientProfileId,
        classTypeId: session.classTypeId,
        clientPackageId: eligiblePackage.id,
        at: now(),
      });

      if (
        !canHoldAnotherBooking({
          sessionsRemaining: eligiblePackage.sessionsRemaining,
          heldCount,
        })
      ) {
        return { state: "PACKAGE_EXHAUSTED" as const };
      }

      const [activeBookingsCount, waitlistCount] = await Promise.all([
        tx.booking.count({ where: { sessionId, canceledAt: null } }),
        tx.waitlistEntry.count({ where: { sessionId } }),
      ]);

      if (activeBookingsCount >= session.capacity) {
        // Full class: add to waitlist with stable position; idempotent.
        const existingWait = await tx.waitlistEntry.findUnique({
          where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
        });
        if (!existingWait) {
          await tx.waitlistEntry.create({
            data: { sessionId, clientProfileId, position: waitlistCount + 1 },
          });
        }
        return { state: "WAITLISTED" as const };
      }

      await tx.booking.upsert({
        where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
        create: {
          sessionId,
          clientProfileId,
          clientPackageId: eligiblePackage.id,
        },
        update: { canceledAt: null, clientPackageId: eligiblePackage.id },
      });
      await tx.waitlistEntry.deleteMany({
        where: { sessionId, clientProfileId },
      });
      return { state: "BOOKED" as const };
    });

    if (result.state === "PACKAGE_EXHAUSTED") {
      return fail(BOOKING_ERRORS.PACKAGE_EXHAUSTED, 409);
    }
    // No in-app notification for self-initiated bookings — the booking sheet
    // shows an immediate inline success block, which is the right UX. We
    // still keep BOOKING_CONFIRMED notifications for spot-opened-from-waitlist
    // promotions (those happen asynchronously and the user needs persistence).

    return ok({ success: true, state: result.state });
  }

  const cancellationTime = now();
  const activeBooking = await prisma.booking.findUnique({
    where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
    select: {
      id: true,
      canceledAt: true,
      clientPackageId: true,
      clientPackage: {
        select: {
          id: true,
          lateCancelHours: true,
        },
      },
      clientProfile: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  await prisma.booking.updateMany({
    where: { sessionId, clientProfileId, canceledAt: null },
    data: { canceledAt: cancellationTime },
  });

  if (activeBooking && !activeBooking.canceledAt) {
    // Late cancellations (within policy window) consume one package session as penalty.
    await applyLateCancelForfeit(prisma, {
      clientProfileId,
      sessionId,
      clientPackageId: activeBooking.clientPackageId,
      sessionStartsAt: session.startsAt,
      canceledAt: cancellationTime,
      lateCancelHours: activeBooking.clientPackage?.lateCancelHours ?? 0,
    });
  }

  const promoted = await prisma.$transaction((tx) =>
    promoteNextWaitlistEntry(tx, sessionId),
  );

  if (activeBooking && !activeBooking.canceledAt) {
    // Fan-out: notify admins + trainer. Late cancels push, early cancels are
    // silent in-app (the registry's push rule).
    // Fire-and-forget: do not block the response on email/push delivery.
    const isLate = shouldApplyLateCancelPenalty(
      session.startsAt,
      cancellationTime,
      activeBooking.clientPackage?.lateCancelHours ?? 0,
    );
    void notifyOperators({
      event: "BOOKING_CANCELED",
      trainers: [{ userId: session.trainerUserId }],
      isLate,
      payload: {
        sessionId,
        clientFullName: formatFullName(
          activeBooking.clientProfile.user.firstName,
          activeBooking.clientProfile.user.lastName,
        ),
        classTypeName: session.classType.name,
        sessionStartsAt: session.startsAt.toISOString(),
        canceledAt: cancellationTime.toISOString(),
        isLate,
      },
    });
  }

  if (promoted) {
    // The promoted client did not act — the system moved them off the waitlist
    // when the actor (this canceling client) freed a spot — so they get the
    // in-app notice AND the email. The canceling client gets neither (it was
    // their own action). One dispatcher fans both channels.
    void notifyClient({
      userId: promoted,
      event: "WAITLIST_PROMOTED",
      vars: { sessionId, state: "WAITLIST_PROMOTED" },
    });
    return ok({ success: true, state: "WAITLIST_PROMOTED" });
  }

  return ok({ success: true, state: "CANCELED" });
}
