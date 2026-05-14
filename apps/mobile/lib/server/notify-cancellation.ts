/**
 * Cancellation notification fan-out.
 *
 * Called from POST /api/bookings (cancel branch) after the booking has been
 * marked canceled. Notifies all admins and the session's assigned trainer.
 * Push is sent for late cancellations (per shouldApplyLateCancelPenalty);
 * early cancellations create silent in-app notifications only.
 */
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { UserRole } from "@/generated/prisma";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";

export type CancellationContext = {
  sessionId: string;
  trainerUserId: string;
  clientFullName: string;
  classTypeName: string;
  sessionStartsAt: Date;
  canceledAt: Date;
  lateCancelHours: number;
};

/**
 * Dispatches one notification per recipient.
 *
 * Recipients: every active User with role=ADMIN, plus the session's trainer.
 * If a trainer is also an admin (unusual but possible) they only get the
 * trainer-flavored notification — we de-duplicate by userId before sending.
 *
 * Fire-and-forget at the call site: the route does not await this.
 */
export async function notifyCancellation(input: CancellationContext) {
  const isLate = shouldApplyLateCancelPenalty(
    input.sessionStartsAt,
    input.canceledAt,
    input.lateCancelHours,
  );
  const skipPush = !isLate;

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true },
    select: { id: true },
  });

  const payload = {
    sessionId: input.sessionId,
    clientFullName: input.clientFullName,
    classTypeName: input.classTypeName,
    sessionStartsAt: input.sessionStartsAt.toISOString(),
    canceledAt: input.canceledAt.toISOString(),
    isLate,
  };

  // Trainer first so dedupe by userId is straightforward below.
  await createSystemNotification(
    input.trainerUserId,
    NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_TRAINER,
    "BOOKING_CANCELED_TRAINER",
    payload,
    { skipPush },
  );

  for (const admin of admins) {
    if (admin.id === input.trainerUserId) continue; // already notified above
    await createSystemNotification(
      admin.id,
      NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_ADMIN,
      "BOOKING_CANCELED_ADMIN",
      payload,
      { skipPush },
    );
  }
}
