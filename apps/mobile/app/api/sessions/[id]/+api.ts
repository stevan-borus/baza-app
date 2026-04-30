import { updateSessionInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";
import { trainerOwnsSession } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

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
    existing.startsAt.getTime() >= Date.now() &&
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

  return ok({ success: true, session });
}
