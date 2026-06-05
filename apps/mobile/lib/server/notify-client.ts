/**
 * Single dispatcher for client-facing notification events.
 *
 * `notifyClient(userId, event, vars)` resolves the recipient's channel
 * preferences ONCE, then fans the event out to every channel the
 * CLIENT_EVENT_CHANNELS registry declares for it (in-app/push via
 * createSystemNotification, transactional email via the booking-email gate).
 *
 * Why one dispatcher: email used to be a parallel `void` line bolted beside
 * each createSystemNotification call, so the two channels were maintained
 * independently and drifted (the ADMIN_CANCEL email kind existed with copy +
 * tests but no dispatch site). Routing both channels through one registry-driven
 * function means a new event wires in-app and email together, from one lookup.
 *
 * Every channel is fired inside its own error boundary — call sites use
 * `void notifyClient(...)` fire-and-forget, so a throw in the email render or
 * the push dispatch must never reject the others or surface as an unhandled
 * rejection.
 */
import type { NotificationLocale } from "@baza/i18n";
import {
  CLIENT_EVENT_CHANNELS,
  type ClientEvent,
} from "@/lib/server/client-event-channels";
import { sendBookingChangeEmailToRecipient } from "@/lib/server/booking-emails";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

/**
 * A recipient's email-channel facts, already loaded by the caller. Pass this
 * when the surrounding route already selected the user (the cancel-bulk and
 * session-update routes do) to avoid a per-recipient round-trip.
 */
export type PrefetchedRecipient = {
  email: string | null;
  bookingEmailsEnabled: boolean;
  preferredLocale: "sr" | "en" | null;
};

async function resolveRecipient(
  userId: string,
): Promise<PrefetchedRecipient | null> {
  const lookup = await tryCatch(
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        notificationPreference: {
          select: { bookingEmailsEnabled: true, preferredLocale: true },
        },
      },
    }),
  );
  if (lookup.error || !lookup.data) return null;
  return {
    email: lookup.data.email,
    // No preference row → column default is true.
    bookingEmailsEnabled:
      lookup.data.notificationPreference?.bookingEmailsEnabled ?? true,
    preferredLocale: lookup.data.notificationPreference?.preferredLocale ?? null,
  };
}

export async function notifyClient(input: {
  userId: string;
  event: ClientEvent;
  vars?: Record<string, string | number | undefined>;
  /** Pre-fetched recipient facts — skips the email/pref lookup when provided. */
  recipient?: PrefetchedRecipient;
}): Promise<void> {
  const channels = CLIENT_EVENT_CHANNELS[input.event];

  // In-app / push side. createSystemNotification owns its own preference lookup
  // (pushEnabled/inAppEnabled) and locale resolution and is already
  // error-tolerant, but wrap it so it can't reject the email side.
  if (channels.inApp) {
    const inApp = channels.inApp;
    await tryCatch(
      createSystemNotification(input.userId, inApp.messageKey, inApp.type, {
        ...input.vars,
      }),
    );
  }

  // Email side.
  if (channels.email) {
    const recipient =
      input.recipient ?? (await resolveRecipient(input.userId));
    if (recipient && recipient.email && recipient.bookingEmailsEnabled) {
      const locale: NotificationLocale =
        recipient.preferredLocale === "en" ? "en" : "sr";
      await tryCatch(
        sendBookingChangeEmailToRecipient({
          to: recipient.email,
          kind: channels.email,
          locale,
          vars: input.vars,
        }),
      );
    }
  }
}
