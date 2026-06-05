import { bookingMutationInputSchema, BOOKING_ERRORS, formatFullName } from "@baza/types";
import { type Prisma, UserRole } from "@/generated/prisma";
import { getConsentStatus } from "@/lib/legal/consent-status";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import { fail, ok } from "@/lib/server/http";
import { notifyClient } from "@/lib/server/notify-client";
import { notifyCancellation } from "@/lib/server/notify-cancellation";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
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

    const [activeBookingsCount, waitlistCount] = await Promise.all([
      prisma.booking.count({
        where: { sessionId, canceledAt: null },
      }),
      prisma.waitlistEntry.count({
        where: { sessionId },
      }),
    ]);

    if (activeBookingsCount >= session.capacity) {
      // Full classes: add to waitlist with stable position; idempotent if already waiting.
      const existingWait = await prisma.waitlistEntry.findUnique({
        where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
      });
      if (!existingWait) {
        await prisma.waitlistEntry.create({
          data: {
            sessionId,
            clientProfileId,
            position: waitlistCount + 1,
          },
        });
      }
      return ok({ success: true, state: "WAITLISTED" });
    }

    await prisma.booking.upsert({
      where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
      create: {
        sessionId,
        clientProfileId,
        clientPackageId: eligiblePackage.id,
      },
      update: {
        canceledAt: null,
        clientPackageId: eligiblePackage.id,
      },
    });
    await prisma.waitlistEntry.deleteMany({
      where: { sessionId, clientProfileId },
    });
    // No in-app notification for self-initiated bookings — the booking sheet
    // shows an immediate inline success block, which is the right UX. We
    // still keep BOOKING_CONFIRMED notifications for spot-opened-from-waitlist
    // promotions (those happen asynchronously and the user needs persistence).

    return ok({ success: true, state: "BOOKED" });
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
    const lateCancelHours =
      activeBooking.clientPackage?.lateCancelHours ?? 0;
    if (
      shouldApplyLateCancelPenalty(
        session.startsAt,
        cancellationTime,
        lateCancelHours,
      )
    ) {
      const existingConsumption = await prisma.sessionConsumption.findUnique({
        where: {
          clientProfileId_sessionId: {
            clientProfileId,
            sessionId,
          },
        },
        select: { id: true },
      });

      if (!existingConsumption) {
        await prisma.sessionConsumption.create({
          data: {
            clientProfileId,
            sessionId,
          },
        });
      }

      if (activeBooking.clientPackageId) {
        await prisma.clientPackage.updateMany({
          where: {
            id: activeBooking.clientPackageId,
            sessionsRemaining: {
              gt: 0,
            },
          },
          data: {
            sessionsRemaining: {
              decrement: 1,
            },
          },
        });
      }
    }
  }

  const promoted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Promote first waitlisted client (by position, then createdAt) after cancellation.
    const nextWaitlist = await tx.waitlistEntry.findFirst({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, clientProfileId: true },
    });
    if (!nextWaitlist) return null;

    await tx.waitlistEntry.delete({
      where: { id: nextWaitlist.id },
    });
    const [clientPackages, packagePauses] = await Promise.all([
      tx.clientPackage.findMany({
        where: {
          clientProfileId: nextWaitlist.clientProfileId,
          classTypeId: session.classTypeId,
        },
        select: {
          id: true,
          classTypeId: true,
          startsAt: true,
          expiresAt: true,
          sessionsRemaining: true,
        },
      }),
      tx.packagePause.findMany({
        where: { clientProfileId: nextWaitlist.clientProfileId },
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
    if (!eligiblePackage) return null;

    await tx.booking.upsert({
      where: {
        sessionId_clientProfileId: {
          sessionId,
          clientProfileId: nextWaitlist.clientProfileId,
        },
      },
      create: {
        sessionId,
        clientProfileId: nextWaitlist.clientProfileId,
        clientPackageId: eligiblePackage.id,
      },
      update: {
        canceledAt: null,
        clientPackageId: eligiblePackage.id,
      },
    });

    // Recompact positions so the next promotion picks the correct client.
    const remainingWaitlist = await tx.waitlistEntry.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await Promise.all(
      remainingWaitlist.map((item: { id: string }, index: number) =>
        tx.waitlistEntry.update({
          where: { id: item.id },
          data: { position: index + 1 },
        }),
      ),
    );

    const promotedClient = await tx.clientProfile.findUnique({
      where: { id: nextWaitlist.clientProfileId },
      select: { userId: true },
    });
    if (!promotedClient) return null;

    return promotedClient.userId;
  });

  if (activeBooking && !activeBooking.canceledAt) {
    // Fan-out: notify admins + trainer.
    // Fire-and-forget: do not block the response on email/push delivery.
    const lateCancelHours = activeBooking.clientPackage?.lateCancelHours ?? 0;
    void notifyCancellation({
      sessionId,
      trainerUserId: session.trainerUserId,
      clientFullName: formatFullName(
        activeBooking.clientProfile.user.firstName,
        activeBooking.clientProfile.user.lastName,
      ),
      classTypeName: session.classType.name,
      sessionStartsAt: session.startsAt,
      canceledAt: cancellationTime,
      lateCancelHours,
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
