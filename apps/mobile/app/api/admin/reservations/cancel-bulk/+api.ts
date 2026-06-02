import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { formatFullName } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

type CancelBulkBody = { bookingIds?: unknown; waiveCharge?: unknown };

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const raw = (await request.json().catch(() => null)) as CancelBulkBody | null;
  if (!raw) return fail("Invalid JSON body", 400);
  const bookingIds = Array.isArray(raw.bookingIds)
    ? raw.bookingIds.filter((id): id is string => typeof id === "string")
    : [];
  if (bookingIds.length === 0) return fail("Missing bookingIds", 400);
  const waiveCharge = raw.waiveCharge === true;

  const cancellationTime = now();

  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, canceledAt: null },
    select: {
      id: true,
      sessionId: true,
      clientProfileId: true,
      clientPackageId: true,
      clientPackage: { select: { id: true, lateCancelHours: true } },
      clientProfile: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      session: {
        select: {
          id: true,
          startsAt: true,
          classTypeId: true,
          trainerUserId: true,
          classType: { select: { name: true } },
        },
      },
    },
  });
  if (bookings.length === 0) return ok({ success: true, canceled: 0 });

  const initiatorId = guard.user.id;

  // Atomic cancel + late-cancel forfeit.
  await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) }, canceledAt: null },
      data: { canceledAt: cancellationTime },
    });
    for (const b of bookings) {
      const lateCancelHours = b.clientPackage?.lateCancelHours ?? 0;
      const isLate = shouldApplyLateCancelPenalty(
        b.session.startsAt,
        cancellationTime,
        lateCancelHours,
      );
      if (!isLate || !b.clientPackageId) continue;

      // Charge waiver: a real forfeit would apply here, but the admin chose to
      // forgive it. Skip the consumption + decrement and record who waived.
      if (waiveCharge) {
        await tx.booking.update({
          where: { id: b.id },
          data: { waivedByUserId: initiatorId },
        });
        continue;
      }

      const existingConsumption = await tx.sessionConsumption.findUnique({
        where: {
          clientProfileId_sessionId: {
            clientProfileId: b.clientProfileId,
            sessionId: b.sessionId,
          },
        },
        select: { id: true },
      });
      if (!existingConsumption) {
        await tx.sessionConsumption.create({
          data: { clientProfileId: b.clientProfileId, sessionId: b.sessionId },
        });
      }
      await tx.clientPackage.updateMany({
        where: { id: b.clientPackageId, sessionsRemaining: { gt: 0 } },
        data: { sessionsRemaining: { decrement: 1 } },
      });
    }
  });

  // Waitlist promotion per session.
  const promotedUserIds = new Set<string>();
  for (const b of bookings) {
    const promotedUserId = await promoteWaitlist(b.sessionId);
    if (promotedUserId) promotedUserIds.add(promotedUserId);
  }

  // Collapsed notification fan-out. Group bookings by trainer and by client.
  // We only fan out one notification per (recipient × client × initiating-admin).
  const byClient = new Map<
    string,
    {
      clientFullName: string;
      bookings: typeof bookings;
    }
  >();
  for (const b of bookings) {
    const clientFullName = formatFullName(
      b.clientProfile.user.firstName,
      b.clientProfile.user.lastName,
    );
    const clientUserId = b.clientProfile.user.id;
    const bucket = byClient.get(clientUserId) ?? { clientFullName, bookings: [] };
    bucket.bookings.push(b);
    byClient.set(clientUserId, bucket);
  }

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });
  const otherAdminIds = admins.map((a) => a.id).filter((id) => id !== initiatorId);

  void (async () => {
    for (const [, bucket] of byClient) {
      // Distinct trainers affected for this client's cancellations.
      const trainerToCount = new Map<string, number>();
      for (const b of bucket.bookings) {
        trainerToCount.set(
          b.session.trainerUserId,
          (trainerToCount.get(b.session.trainerUserId) ?? 0) + 1,
        );
      }

      const payloadBase = {
        clientFullName: bucket.clientFullName,
        count: bucket.bookings.length,
      };

      for (const [trainerUserId, trainerCount] of trainerToCount) {
        if (trainerUserId === initiatorId) continue;
        await createSystemNotification(
          trainerUserId,
          NOTIFICATION_MESSAGE_KEYS.BULK_RESERVATION_CANCEL_TRAINER,
          "BULK_RESERVATION_CANCEL_TRAINER",
          { ...payloadBase, count: trainerCount },
        );
      }
      for (const adminId of otherAdminIds) {
        // Skip if the admin is also the trainer who already got notified.
        if (trainerToCount.has(adminId)) continue;
        await createSystemNotification(
          adminId,
          NOTIFICATION_MESSAGE_KEYS.BULK_RESERVATION_CANCEL_ADMIN,
          "BULK_RESERVATION_CANCEL_ADMIN",
          payloadBase,
        );
      }
    }

    // Coalesced waitlist-promotion push: one per promoted client.
    for (const userId of promotedUserIds) {
      await createSystemNotification(
        userId,
        NOTIFICATION_MESSAGE_KEYS.SPOT_OPENED_FROM_WAITLIST,
        "BOOKING_CONFIRMED",
        { state: "WAITLIST_PROMOTED" },
      );
    }
  })();

  return ok({
    success: true,
    canceled: bookings.length,
    promotedUserIds: [...promotedUserIds],
  });
}

async function promoteWaitlist(sessionId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { id: true, startsAt: true, classTypeId: true },
    });
    if (!session) return null;
    const next = await tx.waitlistEntry.findFirst({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, clientProfileId: true },
    });
    if (!next) return null;

    await tx.waitlistEntry.delete({ where: { id: next.id } });

    const [packs, pauses] = await Promise.all([
      tx.clientPackage.findMany({
        where: {
          clientProfileId: next.clientProfileId,
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
        where: { clientProfileId: next.clientProfileId },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    const eligible = findEligibleClientPackage(
      packs,
      pauses,
      session.startsAt,
      session.classTypeId,
    );
    if (!eligible) return null;

    await tx.booking.upsert({
      where: {
        sessionId_clientProfileId: {
          sessionId,
          clientProfileId: next.clientProfileId,
        },
      },
      create: {
        sessionId,
        clientProfileId: next.clientProfileId,
        clientPackageId: eligible.id,
      },
      update: { canceledAt: null, clientPackageId: eligible.id },
    });

    const remaining = await tx.waitlistEntry.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await Promise.all(
      remaining.map((w, i) =>
        tx.waitlistEntry.update({ where: { id: w.id }, data: { position: i + 1 } }),
      ),
    );

    const promotedClient = await tx.clientProfile.findUnique({
      where: { id: next.clientProfileId },
      select: { userId: true },
    });
    return promotedClient?.userId ?? null;
  });
}
