import { updateSessionInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { nowMs } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { maybeNotifyMinorPaperNeeded } from "@/lib/server/minor-paper-needed";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";
import { findScheduleConflict } from "@/lib/server/schedule-conflict";
import { trainerOwnsSession } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

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
      trainer: { select: { id: true, fullName: true } },
      bookings: {
        where: { canceledAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          clientProfile: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, email: true } },
              // Latest intake row reflects the trainer-visible current state.
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
              // If a withdrawal row exists with `withdrawnAt` newer than
              // the latest intake (or no intake remains), the client has
              // revoked consent — trainer card should reflect that.
              healthIntakeWithdrawals: {
                orderBy: { withdrawnAt: "desc" },
                take: 1,
                select: { withdrawnAt: true },
              },
            },
          },
        },
      },
    },
  });
  if (!session) return fail("Session not found", 404);

  // Photo/video consent for each booked client — read in one batched query
  // (single SQL) rather than per-booking. `findMany` over the union of
  // booked user IDs, then group client-side.
  const bookedUserIds = session.bookings.map(
    (b) => b.clientProfile.user.id,
  );
  const socialMediaRows = bookedUserIds.length
    ? await prisma.consentRecord.findMany({
        where: {
          userId: { in: bookedUserIds },
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

  // Count prior non-canceled bookings per booked client (sessions starting
  // before this one). Used to decide whether to surface the "Prvi put pilates"
  // hint on the trainer card — it only makes sense for clients in their first
  // few sessions. Cutoff: < 3 prior sessions.
  const PRIOR_SESSIONS_CUTOFF = 3;
  const bookedClientProfileIds = session.bookings.map((b) => b.clientProfile.id);
  const priorBookingCounts = bookedClientProfileIds.length
    ? await prisma.booking.groupBy({
        by: ["clientProfileId"],
        where: {
          clientProfileId: { in: bookedClientProfileIds },
          canceledAt: null,
          session: { startsAt: { lt: session.startsAt } },
        },
        _count: { _all: true },
      })
    : [];
  const priorCountByProfileId = new Map(
    priorBookingCounts.map((r) => [r.clientProfileId, r._count._all]),
  );

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
    bookedCount,
    seriesBookedCount,
    bookings: session.bookings.map((b) => {
      const latestIntake = b.clientProfile.healthIntakes[0] ?? null;
      const latestWithdrawal =
        b.clientProfile.healthIntakeWithdrawals[0] ?? null;
      // "Withdrawn" is true when there's a withdrawal newer than the latest
      // intake (or no intake at all). Old withdrawals before a fresh intake
      // shouldn't show as withdrawn.
      const intakeWithdrawn =
        !!latestWithdrawal &&
        (!latestIntake ||
          latestWithdrawal.withdrawnAt > latestIntake.recordedAt);
      const priorCount = priorCountByProfileId.get(b.clientProfile.id) ?? 0;
      // Only surface "first time pilates" if (a) intake says so AND
      // (b) this is one of the client's first few sessions at the studio.
      // After PRIOR_SESSIONS_CUTOFF the trainer knows them, so it's noise.
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
          socialMediaByUserId.get(b.clientProfile.user.id) ?? null,
      };
      return {
        id: b.id,
        createdAt: b.createdAt,
        clientProfileId: b.clientProfile.id,
        client: {
          id: b.clientProfile.user.id,
          fullName: b.clientProfile.user.fullName,
          email: b.clientProfile.user.email,
        },
        consentFlags,
      };
    }),
  };

  return ok({ success: true, session: shaped });
}

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  // Trainers may only edit sessions they are assigned to.
  if (guard.user.role === UserRole.TRAINER) {
    const ownsSession = await trainerOwnsSession(guard.user.id, id);
    if (!ownsSession) return fail("Forbidden", 403);
  }

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

  // Trainers cannot reassign the session to another trainer.
  if (
    guard.user.role === UserRole.TRAINER &&
    parsed.data.trainerUserId &&
    parsed.data.trainerUserId !== guard.user.id
  ) {
    return fail("Trainers can only keep themselves assigned", 403);
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
    guard.user.role === UserRole.TRAINER
      ? guard.user.id
      : parsed.data.trainerUserId === undefined
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
      // Trainers always stay assigned; admins may change trainer.
      trainerUserId:
        guard.user.role === UserRole.TRAINER
          ? guard.user.id
          : parsed.data.trainerUserId,
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
