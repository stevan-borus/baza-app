/**
 * Single dispatcher for operator-facing (Admin/Trainer) notification events —
 * the operator mirror of `notifyClient` / CLIENT_EVENT_CHANNELS.
 *
 * `notifyOperators({ event, ... })` resolves the recipients ONCE per dispatch
 * and applies the cross-cutting rules from CONTEXT.md → Notifications in one
 * place, instead of each endpoint hand-rolling its own loop:
 *   - "all admins" means every active User with role=ADMIN;
 *   - the initiating operator is never notified about their own action
 *     (`excludeUserId`);
 *   - a Trainer who is also an Admin receives only the Trainer-flavored
 *     notification;
 *   - whether an event notifies at all is a registry rule (a client
 *     cancellation only reaches operators when it is late).
 *
 * Call sites use `void notifyOperators(...)` fire-and-forget — a notification
 * failure must never break the request path. Sends are sequential (trainers
 * first, then admins), matching the loops this module replaced.
 */
import { NOTIFICATION_MESSAGE_KEYS, type NotificationMessageKey } from "@baza/i18n";
import { UserRole, type NotificationType } from "@/generated/prisma";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";

export type OperatorEvent =
  | "BOOKING_CANCELED"
  | "BULK_RESERVATION_CANCEL"
  | "SESSION_UPDATED"
  | "UNBACKED_ATTENDANCE"
  | "MINOR_PAPER_NEEDED"
  | "BIRTHDAY_ADMIN_PROMPT";

type OperatorFlavor = {
  messageKey: NotificationMessageKey;
  type: NotificationType;
};

type OperatorChannelSpec = {
  /** Flavor sent to the Session's assigned Trainer(s), if any. */
  trainer?: OperatorFlavor;
  /** Flavor sent to every active Admin, if any. */
  admins?: OperatorFlavor;
  /**
   * "always" notifies on every dispatch; "when-late" notifies only when the
   * dispatch carries `isLate: true` — an early cancellation writes no
   * NotificationLog row and sends no push.
   */
  deliver: "always" | "when-late";
};

export const OPERATOR_EVENT_CHANNELS: Record<OperatorEvent, OperatorChannelSpec> = {
  // A single booking was canceled (client self-cancel route).
  BOOKING_CANCELED: {
    trainer: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_TRAINER,
      type: "BOOKING_CANCELED_TRAINER",
    },
    admins: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.BOOKING_CANCELED_ADMIN,
      type: "BOOKING_CANCELED_ADMIN",
    },
    deliver: "when-late",
  },
  // An admin canceled N of one client's reservations in a single action.
  // The fan-out collapses to one notification per recipient with a count.
  BULK_RESERVATION_CANCEL: {
    trainer: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.BULK_RESERVATION_CANCEL_TRAINER,
      type: "BULK_RESERVATION_CANCEL_TRAINER",
    },
    admins: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.BULK_RESERVATION_CANCEL_ADMIN,
      type: "BULK_RESERVATION_CANCEL_ADMIN",
    },
    deliver: "always",
  },
  // A session's details changed (or it was canceled) — keep the assigned
  // trainer's roster accurate. Booked clients are notified via notifyClient;
  // other admins are not fanned out.
  SESSION_UPDATED: {
    trainer: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.SESSION_UPDATED,
      type: "SESSION_UPDATED",
    },
    deliver: "always",
  },
  // cron:sessions resolved no eligible package for a completed booking — the
  // client attended unbacked; admins decide whether to sell/comp/cancel.
  UNBACKED_ATTENDANCE: {
    admins: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.RESERVATION_UNBACKED_ATTENDANCE,
      type: "RESERVATION_UNBACKED_ATTENDANCE",
    },
    deliver: "always",
  },
  // An unverified minor completed their first session — the studio must
  // collect the guardian's wet signature.
  MINOR_PAPER_NEEDED: {
    admins: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.MINOR_PAPER_NEEDED,
      type: "MINOR_PAPER_NEEDED",
    },
    deliver: "always",
  },
  // A client's birthday is today — prompt admins to send the gift package.
  BIRTHDAY_ADMIN_PROMPT: {
    admins: {
      messageKey: NOTIFICATION_MESSAGE_KEYS.BIRTHDAY_ADMIN_PROMPT,
      type: "BIRTHDAY_ADMIN_PROMPT",
    },
    deliver: "always",
  },
};

/**
 * Bulk coalescing: collapse one-entry-per-cancelled-Booking into one trainer
 * recipient per distinct trainer, carrying how many of the client's bookings
 * hit them (the per-trainer `count` overrides the payload's total count).
 */
export function coalesceTrainerCancelCounts(
  trainerUserIds: string[],
): Array<{ userId: string; payload: { count: number } }> {
  const counts = new Map<string, number>();
  for (const id of trainerUserIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([userId, count]) => ({ userId, payload: { count } }));
}

export async function notifyOperators(input: {
  event: OperatorEvent;
  /**
   * The Session's assigned Trainer(s). A bulk action passes one entry per
   * affected trainer with a per-trainer `payload` override (e.g. its count).
   */
  trainers?: Array<{ userId: string; payload?: Record<string, unknown> }>;
  /** The initiating operator — never notified about their own action. */
  excludeUserId?: string;
  payload: Record<string, unknown>;
  /** Delivery input for `deliver: "when-late"` events; ignored otherwise. */
  isLate?: boolean;
  /**
   * Per-recipient dedupe key — makes a retried cron dispatch resolve to the
   * same NotificationLog row instead of duplicating it.
   */
  dedupeKey?: (recipientUserId: string) => string;
}): Promise<void> {
  const spec = OPERATOR_EVENT_CHANNELS[input.event];
  if (spec.deliver === "when-late" && input.isLate !== true) return;

  const optionsFor = (recipientUserId: string) =>
    input.dedupeKey ? { dedupeKey: input.dedupeKey(recipientUserId) } : undefined;

  const trainers = input.trainers ?? [];
  if (spec.trainer) {
    for (const trainer of trainers) {
      if (trainer.userId === input.excludeUserId) continue;
      await createSystemNotification(
        trainer.userId,
        spec.trainer.messageKey,
        spec.trainer.type,
        { ...input.payload, ...trainer.payload },
        optionsFor(trainer.userId),
      );
    }
  }

  if (spec.admins) {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    // Admins who are also among the affected trainers got the trainer flavor.
    const trainerIds = new Set(trainers.map((t) => t.userId));
    for (const admin of admins) {
      if (admin.id === input.excludeUserId) continue;
      if (trainerIds.has(admin.id)) continue;
      await createSystemNotification(
        admin.id,
        spec.admins.messageKey,
        spec.admins.type,
        input.payload,
        optionsFor(admin.id),
      );
    }
  }
}
