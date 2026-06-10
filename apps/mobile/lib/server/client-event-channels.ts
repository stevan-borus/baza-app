/**
 * The single registry of client-facing notification events and the channels
 * each one fans out to.
 *
 * One client EVENT (something that happened *to* the client) maps to an
 * optional in-app/push notification and an optional transactional email. The
 * `notifyClient` dispatcher reads this table and fires every declared channel
 * from ONE preference lookup — so a new event wires in-app and email together
 * in one place and the two channels can't silently drift (the dead ADMIN_CANCEL
 * email kind, which had copy + tests but no dispatch site, was exactly that
 * drift).
 *
 * Events that target only operators (trainer/admin notices) are NOT client
 * events — they dispatch through the parallel `notifyOperators` registry
 * (see notify-operators.ts) and must never email a client.
 */
import type { BookingEmailKind, NotificationMessageKey } from "@baza/i18n";
import type { NotificationType } from "@/generated/prisma";

export type ClientEvent =
  | "WAITLIST_PROMOTED"
  | "SESSION_UPDATED"
  | "ADMIN_CANCEL"
  | "BULK_CANCEL";

type ChannelSpec = {
  /** Transactional email kind, or undefined if this event sends no email. */
  email?: BookingEmailKind;
  /** In-app + push notification, or undefined if this event has no in-app side. */
  inApp?: { messageKey: NotificationMessageKey; type: NotificationType };
};

export const CLIENT_EVENT_CHANNELS: Record<ClientEvent, ChannelSpec> = {
  // System moved them off the waitlist into a confirmed booking.
  WAITLIST_PROMOTED: {
    email: "WAITLIST_PROMOTED",
    inApp: { messageKey: "SPOT_OPENED_FROM_WAITLIST", type: "BOOKING_CONFIRMED" },
  },
  // A session they hold changed (time / room / trainer / capacity).
  SESSION_UPDATED: {
    email: "SESSION_UPDATED",
    inApp: { messageKey: "SESSION_UPDATED", type: "SESSION_UPDATED" },
  },
  // A single booking was canceled by the studio. Email-only: the client's
  // in-app cancellation visibility is handled by the booking record itself.
  ADMIN_CANCEL: {
    email: "ADMIN_CANCEL",
  },
  // Several of their bookings were canceled in one admin action. Email-only,
  // for the same reason as ADMIN_CANCEL.
  BULK_CANCEL: {
    email: "BULK_CANCEL",
  },
};
