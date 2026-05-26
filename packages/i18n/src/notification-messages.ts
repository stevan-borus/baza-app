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
  | "BOOKING_CANCELED_TRAINER"
  | "MINOR_PAPER_NEEDED"
  | "BIRTHDAY_ADMIN_PROMPT"
  | "BIRTHDAY_CLIENT_GIFT"
  | "RESERVATION_UNBACKED_ATTENDANCE"
  | "BULK_RESERVATION_CANCEL_ADMIN"
  | "BULK_RESERVATION_CANCEL_TRAINER";

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
  MINOR_PAPER_NEEDED: "MINOR_PAPER_NEEDED",
  BIRTHDAY_ADMIN_PROMPT: "BIRTHDAY_ADMIN_PROMPT",
  BIRTHDAY_CLIENT_GIFT: "BIRTHDAY_CLIENT_GIFT",
  RESERVATION_UNBACKED_ATTENDANCE: "RESERVATION_UNBACKED_ATTENDANCE",
  BULK_RESERVATION_CANCEL_ADMIN: "BULK_RESERVATION_CANCEL_ADMIN",
  BULK_RESERVATION_CANCEL_TRAINER: "BULK_RESERVATION_CANCEL_TRAINER",
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
    sr: { title: "Beleška trenera", body: "{{trainerFullName}} je ostavio/la belešku." },
    en: { title: "Trainer note", body: "{{trainerFullName}} left you a note." },
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
      body: "{{clientFullName}} je otkazao/la {{classTypeName}}.",
    },
    en: {
      title: "Booking canceled",
      body: "{{clientFullName}} canceled {{classTypeName}}.",
    },
  },
  BOOKING_CANCELED_TRAINER: {
    sr: {
      title: "Otkazana rezervacija",
      body: "{{clientFullName}} je otkazao/la tvoj termin ({{classTypeName}}).",
    },
    en: {
      title: "Booking canceled",
      body: "{{clientFullName}} canceled your session ({{classTypeName}}).",
    },
  },
  MINOR_PAPER_NEEDED: {
    sr: {
      title: "Potreban potpis roditelja",
      body: "Klijent je odradio/la prvu sesiju i potreban je potpis roditelja.",
    },
    en: {
      title: "Guardian signature needed",
      body: "A minor client completed their first session — collect the paper signature.",
    },
  },
  BIRTHDAY_ADMIN_PROMPT: {
    sr: {
      title: "🎂 Rođendan klijenta",
      body: "{{clientFullName}} slavi danas — pokloni mu/joj sesiju.",
    },
    en: {
      title: "🎂 Client birthday",
      body: "{{clientFullName}} is celebrating today — gift them a session.",
    },
  },
  BIRTHDAY_CLIENT_GIFT: {
    sr: {
      title: "🎉 Srećan rođendan!",
      body: "Poklanjamo ti besplatnu sesiju iz paketa \"{{packageTypeName}}\".",
    },
    en: {
      title: "🎉 Happy birthday!",
      body: "We're gifting you a free \"{{packageTypeName}}\" session.",
    },
  },
  RESERVATION_UNBACKED_ATTENDANCE: {
    sr: {
      title: "Klijent bez paketa",
      body: "{{clientFullName}} je odradio/la {{classTypeName}} — nije skinuta sesija iz paketa.",
    },
    en: {
      title: "Unbacked attendance",
      body: "{{clientFullName}} attended {{classTypeName}} — no package was decremented.",
    },
  },
  BULK_RESERVATION_CANCEL_ADMIN: {
    sr: {
      title: "Otkazane rezervacije",
      body: "Otkazano je {{count}} rezervacija za {{clientFullName}}.",
    },
    en: {
      title: "Reservations canceled",
      body: "{{count}} reservations canceled for {{clientFullName}}.",
    },
  },
  BULK_RESERVATION_CANCEL_TRAINER: {
    sr: {
      title: "Otkazane rezervacije",
      body: "{{count}} tvojih termina otkazano za {{clientFullName}}.",
    },
    en: {
      title: "Reservations canceled",
      body: "{{count}} of your sessions canceled for {{clientFullName}}.",
    },
  },
};

export const NOTIFICATION_MESSAGE_I18N_KEYS: Record<
  NotificationMessageKey,
  string
> = Object.fromEntries(
  Object.keys(messages).map((key) => [key, `notification.${key.toLowerCase()}`]),
) as Record<NotificationMessageKey, string>;

function interpolate(template: string, vars?: Record<string, string | number | undefined>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function getNotificationMessage(
  key: NotificationMessageKey,
  locale: NotificationLocale = "sr",
  vars?: Record<string, string | number | undefined>,
): { title: string; body: string } {
  const template = messages[key]?.[locale] ?? messages[key]?.sr ?? { title: "", body: "" };
  return {
    title: interpolate(template.title, vars),
    body: interpolate(template.body, vars),
  };
}
