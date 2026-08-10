import {
  bookingMutationInputSchema,
  bookingMutationResultSchema,
  BOOKING_ERRORS,
} from "@baza/types/bookings";
import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import {
  applyLateCancelForfeit,
  promoteNextWaitlistEntry,
} from "@/lib/server/booking-cancellation";
import { respond, fail, parseBody } from "@/lib/server/http";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import { notifyClient } from "@/lib/server/notify-client";
import { notifyOperators } from "@/lib/server/notify-operators";
import { countHeldSessions } from "@/lib/server/booking-hold-count";
import { isEmptySessionCutoffLocked } from "@/lib/server/booking-cutoff";
import {
  ELIGIBILITY_PACKAGE_SELECT,
  findEligibleClientPackage,
  toEligibilityPackage,
} from "@/lib/server/package-eligibility";
import { canHoldAnotherBooking } from "@/lib/server/package-hold";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const clientProfileId = guard.user.clientProfile?.id;
  if (!clientProfileId) return fail("Client profile not found", 404);

  const parsed = await parseBody(request, bookingMutationInputSchema);
  if (!parsed.ok) return parsed.response;

  const { action, sessionId } = parsed.data;

  if (action === "LEAVE_WAITLIST") {
    // Handled BEFORE the SCHEDULED-only session guard below: a client must be
    // able to free the reserved session even if the class was since canceled
    // (a canceled session leaves the waitlist row — and its held slot — behind,
    // and never appears in availability, so this is the only way out). It only
    // deletes the CALLER's own row (scoped by clientProfileId), so it's safe
    // regardless of session status. Idempotent: no row is still success. No
    // forfeit, no promotion — a waitlist seat never held a real spot.
    await prisma.waitlistEntry.deleteMany({
      where: { sessionId, clientProfileId },
    });
    return respond(bookingMutationResultSchema, {
      success: true,
      state: "LEFT_WAITLIST",
    });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      status: true,
      classTypeId: true,
      trainerUserId: true,
      classType: { select: { name: true, emptyBookingCutoffHours: true } },
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
        where: {
          clientProfileId,
          classTypes: { some: { classTypeId: session.classTypeId } },
        },
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

    const eligiblePackage = findEligibleClientPackage(
      clientPackages.map(toEligibilityPackage),
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
      return respond(bookingMutationResultSchema, {
        success: true,
        state: "BOOKED_ALREADY",
      });

    // Count holds + create the booking/waitlist atomically so two concurrent
    // requests can't both pass the overuse check on the last remaining session.
    const result = await prisma.$transaction(async (tx) => {
      const heldCount = await countHeldSessions(tx, {
        clientProfileId,
        classTypeIds: eligiblePackage.classTypeIds,
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

      if (
        isEmptySessionCutoffLocked({
          startsAt: session.startsAt,
          activeBookingsCount,
          cutoffHours: session.classType.emptyBookingCutoffHours,
          at: now(),
        })
      ) {
        return { state: "EMPTY_SESSION_CUTOFF" as const };
      }

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
    if (result.state === "EMPTY_SESSION_CUTOFF") {
      return fail(BOOKING_ERRORS.EMPTY_SESSION_CUTOFF, 409);
    }
    // No in-app notification for self-initiated bookings — the booking sheet
    // shows an immediate inline success block, which is the right UX. We
    // still keep BOOKING_CONFIRMED notifications for spot-opened-from-waitlist
    // promotions (those happen asynchronously and the user needs persistence).

    return respond(bookingMutationResultSchema, {
      success: true,
      state: result.state,
    });
  }

  // CANCEL path. A cancel is blocked the moment the session has started: once
  // the class is in progress (or past), the seat was effectively used, so
  // letting the client back out here would be a free escape — no forfeit fires
  // post-start (the penalty policy only applies before start). Guard here, not
  // in the generic status check above, because an in-progress session is still
  // SCHEDULED. BOOK has its own past-start guard; LEAVE_WAITLIST returned above.
  if (session.startsAt.getTime() <= now().getTime()) {
    return fail(BOOKING_ERRORS.SESSION_ALREADY_STARTED, 409);
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

  // Cancel + forfeit are ONE atomic unit: previously these ran as two
  // sequential root-client calls, so a crash between them could leave a
  // cancelled booking whose late-cancel penalty never landed. The forfeit's
  // SessionConsumption unique guard keeps retries idempotent inside the
  // transaction too. Waitlist promotion stays its own transaction, as before.
  await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: { sessionId, clientProfileId, canceledAt: null },
      data: { canceledAt: cancellationTime },
    });

    if (activeBooking && !activeBooking.canceledAt) {
      // Late cancellations (within policy window) consume one package session as penalty.
      await applyLateCancelForfeit(tx, {
        clientProfileId,
        sessionId,
        clientPackageId: activeBooking.clientPackageId,
        sessionStartsAt: session.startsAt,
        canceledAt: cancellationTime,
        lateCancelHours: activeBooking.clientPackage?.lateCancelHours ?? 0,
      });
    }
  });

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
    return respond(bookingMutationResultSchema, {
      success: true,
      state: "WAITLIST_PROMOTED",
    });
  }

  return respond(bookingMutationResultSchema, {
    success: true,
    state: "CANCELED",
  });
}
