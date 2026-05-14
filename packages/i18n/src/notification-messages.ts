export type NotificationLocale = "sr" | "en";

export type NotificationMessageKey =
  | "BOOKING_CONFIRMED"
  | "SESSION_UPDATED"
  | "TRAINER_NOTE"
  | "GENERAL"
  | "SPOT_OPENED_FROM_WAITLIST"
  | "PACKAGE_EXPIRING_SOON"
  | "SESSION_REMINDER"
  | "BOOKING_CANCELED_ADMIN"
  | "BOOKING_CANCELED_TRAINER";

export const NOTIFICATION_MESSAGE_KEYS = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  SESSION_UPDATED: "SESSION_UPDATED",
  TRAINER_NOTE: "TRAINER_NOTE",
  GENERAL: "GENERAL",
  SPOT_OPENED_FROM_WAITLIST: "SPOT_OPENED_FROM_WAITLIST",
  PACKAGE_EXPIRING_SOON: "PACKAGE_EXPIRING_SOON",
  SESSION_REMINDER: "SESSION_REMINDER",
  BOOKING_CANCELED_ADMIN: "BOOKING_CANCELED_ADMIN",
  BOOKING_CANCELED_TRAINER: "BOOKING_CANCELED_TRAINER",
} as const satisfies Record<NotificationMessageKey, NotificationMessageKey>;

const messages: Record<
  NotificationMessageKey,
  Record<NotificationLocale, { title: string; body: string }>
> = {
  BOOKING_CONFIRMED: {
    sr: { title: "Rezervacija potvrđena", body: "Vaša rezervacija je potvrđena." },
    en: { title: "Booking confirmed", body: "Your booking has been confirmed." },
  },
  SESSION_UPDATED: {
    sr: { title: "Termin ažuriran", body: "Termin je ažuriran." },
    en: { title: "Session updated", body: "The session has been updated." },
  },
  TRAINER_NOTE: {
    sr: { title: "Beleška trenera", body: "Trener je ostavio belešku." },
    en: { title: "Trainer note", body: "Your trainer left a note." },
  },
  GENERAL: {
    sr: { title: "Obaveštenje", body: "" },
    en: { title: "Notification", body: "" },
  },
  SPOT_OPENED_FROM_WAITLIST: {
    sr: { title: "Mesto slobodno", body: "Mesto se oslobodilo sa liste čekanja." },
    en: { title: "Spot opened", body: "A spot opened from the waitlist." },
  },
  PACKAGE_EXPIRING_SOON: {
    sr: { title: "Paket ističe", body: "Vaš paket uskoro ističe." },
    en: { title: "Package expiring", body: "Your package is expiring soon." },
  },
  SESSION_REMINDER: {
    sr: { title: "Podsetnik", body: "Imate zakazan termin uskoro." },
    en: { title: "Session reminder", body: "You have an upcoming session." },
  },
  BOOKING_CANCELED_ADMIN: {
    sr: {
      title: "Otkazana rezervacija",
      body: "Klijent je otkazao termin.",
    },
    en: {
      title: "Booking canceled",
      body: "A client canceled their session.",
    },
  },
  BOOKING_CANCELED_TRAINER: {
    sr: {
      title: "Otkazana rezervacija",
      body: "Klijent je otkazao tvoj termin.",
    },
    en: {
      title: "Booking canceled",
      body: "A client canceled your session.",
    },
  },
};

export const NOTIFICATION_MESSAGE_I18N_KEYS: Record<
  NotificationMessageKey,
  string
> = Object.fromEntries(
  Object.keys(messages).map((key) => [key, `notification.${key.toLowerCase()}`]),
) as Record<NotificationMessageKey, string>;

export function getNotificationMessage(
  key: NotificationMessageKey,
  locale: NotificationLocale = "sr",
): { title: string; body: string } {
  return messages[key]?.[locale] ?? messages[key]?.sr ?? { title: "", body: "" };
}
