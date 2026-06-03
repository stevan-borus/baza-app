import { formatFullName, updateSessionInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { nowMs } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { sendBookingChangeEmailIfEnabled } from "@/lib/server/booking-emails";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { maybeNotifyMinorPaperNeeded } from "@/lib/server/minor-paper-needed";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";
import { findScheduleConflict } from "@/lib/server/schedule-conflict";
import { trainerOwnsSession } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

/**
 * Shared client selection for the trainer-visible consent strip. Used for both
 * booked clients and waitlisted clients so they shape identically: the latest
 * health intake (current state) and the latest withdrawal (revoked consent).
 */
const clientConsentSelect = {
  id: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  healthIntakes: {
    orderBy: { recordedAt: "desc" },
    take: 1,
    select: {
      conditions: true,
      conditionsOther: true,
      pilatesExperience: true,
      additionalNotes: true,
      recordedAt: true,
    },
  },
  healthIntakeWithdrawals: {
    orderBy: { withdrawnAt: "desc" },
    take: 1,
    select: { withdrawnAt: true },
  },
} as const;

export async function GET(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  if (guard.user.role === UserRole.TRAINER) {
    const ownsSession = await trainerOwnsSession(guard.user.id, id);
    if (!ownsSession) return fail("Forbidden", 403);
  }

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      capacity: true,
      isActive: true,
      classTypeId: true,
      roomId: true,
      trainerUserId: true,
      recurringScheduleId: true,
      classType: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
      trainer: { select: { id: true, firstName: true, lastName: true } },
      bookings: {
        where: { canceledAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          clientProfile: { select: clientConsentSelect },
        },
      },
      // Waitlisted clients (not yet booked). Surfaced under session.waitlist
      // so the trainer can see who's queued for a freed slot, in queue order.
      waitlist: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          clientProfile: { select: clientConsentSelect },
        },
      },
    },
  });
  if (!session) return fail("Session not found", 404);

  // Photo/video consent — read in one batched query (single SQL) over the
  // union of booked AND waitlisted user IDs, then group client-side. Both
  // lists render the same consent strip, so both need the lookup.
  const allUserIds = [
    ...session.bookings.map((b) => b.clientProfile.user.id),
    ...session.waitlist.map((w) => w.clientProfile.user.id),
  ];
  const socialMediaRows = allUserIds.length
    ? await prisma.consentRecord.findMany({
        where: {
          userId: { in: allUserIds },
          documentKey: "social_media",
        },
        orderBy: { acceptedAt: "desc" },
        distinct: ["userId"],
        select: { userId: true, accepted: true },
      })
    : [];
  const socialMediaByUserId = new Map(
    socialMediaRows.map((r) => [r.userId, r.accepted]),
  );

  // Count prior non-canceled bookings per client (sessions starting before
  // this one). Drives the "Prvi put pilates" hint — only meaningful for a
  // client's first few sessions. Cutoff: < 3 prior sessions. Covers booked
  // and waitlisted clients alike.
  const PRIOR_SESSIONS_CUTOFF = 3;
  const allClientProfileIds = [
    ...session.bookings.map((b) => b.clientProfile.id),
    ...session.waitlist.map((w) => w.clientProfile.id),
  ];
  const priorBookingCounts = allClientProfileIds.length
    ? await prisma.booking.groupBy({
        by: ["clientProfileId"],
        where: {
          clientProfileId: { in: allClientProfileIds },
          canceledAt: null,
          session: { startsAt: { lt: session.startsAt } },
        },
        _count: { _all: true },
      })
    : [];
  const priorCountByProfileId = new Map(
    priorBookingCounts.map((r) => [r.clientProfileId, r._count._all]),
  );

  // Shapes one client (booked or waitlisted) into the consent strip the
  // trainer card renders. Identical for both lists — factored out so they
  // can't drift. `clientProfile` matches `clientConsentSelect`.
  type ConsentClientProfile = {
    id: string;
    user: { id: string; firstName: string; lastName: string; email: string };
    healthIntakes: Array<{
      conditions: string[];
      conditionsOther: string | null;
      pilatesExperience: string[];
      additionalNotes: string | null;
      recordedAt: Date;
    }>;
    healthIntakeWithdrawals: Array<{ withdrawnAt: Date }>;
  };
  const shapeClient = (clientProfile: ConsentClientProfile) => {
    const latestIntake = clientProfile.healthIntakes[0] ?? null;
    const latestWithdrawal = clientProfile.healthIntakeWithdrawals[0] ?? null;
    // "Withdrawn" is true when there's a withdrawal newer than the latest
    // intake (or no intake at all). Old withdrawals before a fresh intake
    // shouldn't show as withdrawn.
    const intakeWithdrawn =
      !!latestWithdrawal &&
      (!latestIntake || latestWithdrawal.withdrawnAt > latestIntake.recordedAt);
    const priorCount = priorCountByProfileId.get(clientProfile.id) ?? 0;
    const intakeConditions =
      !intakeWithdrawn && latestIntake ? latestIntake.conditions : [];
    const showFirstPilatesHint =
      !intakeWithdrawn &&
      latestIntake?.pilatesExperience.includes("none") === true &&
      priorCount < PRIOR_SESSIONS_CUTOFF;
    const consentFlags = {
      showFirstPilatesHint,
      conditions: intakeConditions,
      conditionsOther: intakeWithdrawn
        ? null
        : (latestIntake?.conditionsOther ?? null),
      additionalNotes: intakeWithdrawn
        ? null
        : (latestIntake?.additionalNotes ?? null),
      intakeRecorded: !intakeWithdrawn && latestIntake !== null,
      intakeWithdrawn,
      socialMediaAccepted:
        socialMediaByUserId.get(clientProfile.user.id) ?? null,
    };
    return {
      clientProfileId: clientProfile.id,
      client: {
        id: clientProfile.user.id,
        fullName: formatFullName(
          clientProfile.user.firstName,
          clientProfile.user.lastName,
        ),
        email: clientProfile.user.email,
      },
      consentFlags,
    };
  };

  // ADR-0002: surface bookedCount + seriesBookedCount so the edit sheet can
  // gate the "visible to clients" toggle by both rules. For a singleton
  // session (no recurring linkage) they're equal — the series IS this one
  // session. For a recurring series, count non-canceled bookings across
  // every session sharing the same recurringScheduleId, matching the
  // bookings list selector above (`canceledAt: null`).
  const bookedCount = session.bookings.length;
  const seriesBookedCount = session.recurringScheduleId
    ? await prisma.booking.count({
        where: {
          session: { recurringScheduleId: session.recurringScheduleId },
          canceledAt: null,
        },
      })
    : bookedCount;

  const shaped = {
    ...session,
    trainer: session.trainer
      ? {
          id: session.trainer.id,
          fullName: formatFullName(
            session.trainer.firstName,
            session.trainer.lastName,
          ),
        }
      : null,
    bookedCount,
    seriesBookedCount,
    bookings: session.bookings.map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      ...shapeClient(b.clientProfile),
    })),
    waitlist: session.waitlist.map((w) => ({
      id: w.id,
      position: w.position,
      ...shapeClient(w.clientProfile),
    })),
  };

  return ok({ success: true, session: shaped });
}

export async function PATCH(request: Request, { id }: RouteParams) {
  // Admin-only. Trainers are read-only on sessions — they can view their
  // roster (GET) but cannot edit, cancel, change capacity, reassign, or hide
  // a session. The session-detail UI hides the edit affordance for trainers;
  // this is the matching server-side boundary.
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = updateSessionInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const existing = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      trainerUserId: true,
      roomId: true,
      isActive: true,
      recurringScheduleId: true,
      bookings: {
        where: { canceledAt: null },
        select: {
          clientProfile: {
            select: { userId: true },
          },
        },
      },
    },
  });
  if (!existing) return fail("Session not found", 404);

  // Hide-OFF guard: refuse to deactivate a future session that has live bookings.
  // Cancellation must go through the explicit `status: CANCELED` flow which
  // notifies clients. Only applies to one-time sessions (recurring use the
  // series-level toggle).
  if (
    parsed.data.isActive === false &&
    existing.isActive &&
    !existing.recurringScheduleId &&
    existing.startsAt.getTime() >= nowMs() &&
    existing.bookings.length > 0
  ) {
    return fail(
      "Cannot hide — session has active bookings. Cancel them first.",
      409,
    );
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endsAt;
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return fail("Invalid schedule range", 400);
  }

  // Schedule conflict: refuse if another live session overlaps on the same
  // room (when set) OR the same trainer. Excludes the session being edited.
  const nextRoomId =
    parsed.data.roomId === undefined ? existing.roomId : parsed.data.roomId;
  const nextTrainerUserId =
    parsed.data.trainerUserId === undefined
      ? existing.trainerUserId
      : parsed.data.trainerUserId;
  const conflict = await findScheduleConflict({
    startsAt,
    endsAt,
    roomId: nextRoomId,
    trainerUserId: nextTrainerUserId,
    excludeSessionId: id,
  });
  if (conflict) {
    return Response.json(
      {
        success: false,
        error: "Schedule conflict",
        conflict,
      },
      { status: 409 },
    );
  }

  const session = await prisma.session.update({
    where: { id },
    data: {
      startsAt,
      endsAt,
      capacity: parsed.data.capacity,
      roomId: parsed.data.roomId,
      status: parsed.data.status,
      isActive: parsed.data.isActive,
      trainerUserId: parsed.data.trainerUserId,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      trainerUserId: true,
      isActive: true,
    },
  });

  const changed =
    existing.startsAt.getTime() !== session.startsAt.getTime() ||
    existing.endsAt.getTime() !== session.endsAt.getTime() ||
    existing.status !== session.status ||
    existing.trainerUserId !== session.trainerUserId;
  if (changed) {
    // Notify booked clients and assigned trainer of schedule/status changes.
    const bookedUserIds = existing.bookings.map((booking: { clientProfile: { userId: string } }) => booking.clientProfile.userId);
    // Email only booked clients — something changed about a session they hold.
    // The trainer keeps the in-app notification below but gets no email.
    for (const clientUserId of bookedUserIds) {
      void sendBookingChangeEmailIfEnabled({ userId: clientUserId, kind: "SESSION_UPDATED" });
    }
    const notifyUserIds = new Set<string>(bookedUserIds);
    if (session.trainerUserId) {
      notifyUserIds.add(session.trainerUserId);
    }
    await Promise.all(
      [...notifyUserIds].map((userId) =>
        createSystemNotification(userId, NOTIFICATION_MESSAGE_KEYS.SESSION_UPDATED, "SESSION_UPDATED", {
          sessionId: session.id,
          status: session.status,
        }),
      ),
    );
  }

  // Fire MINOR_PAPER_NEEDED when a session transitions to COMPLETED for the
  // first time. Guard lives inside the helper — it only notifies for minors
  // whose first session this is and whose guardian has not yet signed.
  if (existing.status !== "COMPLETED" && session.status === "COMPLETED") {
    await maybeNotifyMinorPaperNeeded(session.id);
  }

  return ok({ success: true, session });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // Admin-only true delete. Trainers must use PATCH with status=CANCELED so
  // booked clients are notified through the standard channel.

  const existing = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      _count: {
        select: {
          bookings: { where: { canceledAt: null } },
        },
      },
    },
  });
  if (!existing) return fail("Session not found", 404);

  if (existing._count.bookings > 0) {
    return fail(
      "Session has active bookings — cancel them before deleting",
      409,
    );
  }

  await prisma.session.delete({ where: { id } });
  return ok({ success: true });
}
