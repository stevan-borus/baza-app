export type NotificationLocale = "sr" | "en";

/**
 * The single rule for resolving a stored preferredLocale into a notification
 * locale: "en" only on an exact match, "sr" otherwise (the studio default,
 * also the fallback for null/unset). Server notification/email paths share
 * this so the default can't drift between channels.
 */
export function resolveLocale(
  preferredLocale: string | null | undefined,
): NotificationLocale {
  return preferredLocale === "en" ? "en" : "sr";
}

export type NotificationMessageKey =
  | "BOOKING_CONFIRMED"
  | "SESSION_UPDATED"
  | "SESSION_DETAILS_UPDATED"
  | "SESSION_RESCHEDULED"
  | "TRAINER_NOTE"
  | "GENERAL"
  | "SPOT_OPENED_FROM_WAITLIST"
  | "PACKAGE_EXPIRING_SOON"
  | "PACKAGE_REVOKED"
  | "PACKAGE_PAUSED"
  | "PACKAGE_PAUSE_UPDATED"
  | "SESSION_REMINDER"
  | "BOOKING_CANCELED_ADMIN"
  | "BOOKING_CANCELED_TRAINER"
  | "MINOR_PAPER_NEEDED"
  | "BIRTHDAY_ADMIN_PROMPT"
  | "BIRTHDAY_CLIENT_GIFT"
  | "RESERVATION_UNBACKED_ATTENDANCE"
  | "BULK_RESERVATION_CANCEL_ADMIN"
  | "BULK_RESERVATION_CANCEL_TRAINER"
  | "PACKAGE_PURCHASED"
  | "PACKAGE_ASSIGNED"
  | "TRAINER_DAILY_SCHEDULE";

export const NOTIFICATION_MESSAGE_KEYS = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  SESSION_UPDATED: "SESSION_UPDATED",
  SESSION_DETAILS_UPDATED: "SESSION_DETAILS_UPDATED",
  SESSION_RESCHEDULED: "SESSION_RESCHEDULED",
  TRAINER_NOTE: "TRAINER_NOTE",
  GENERAL: "GENERAL",
  SPOT_OPENED_FROM_WAITLIST: "SPOT_OPENED_FROM_WAITLIST",
  PACKAGE_EXPIRING_SOON: "PACKAGE_EXPIRING_SOON",
  PACKAGE_REVOKED: "PACKAGE_REVOKED",
  PACKAGE_PAUSED: "PACKAGE_PAUSED",
  PACKAGE_PAUSE_UPDATED: "PACKAGE_PAUSE_UPDATED",
  SESSION_REMINDER: "SESSION_REMINDER",
  BOOKING_CANCELED_ADMIN: "BOOKING_CANCELED_ADMIN",
  BOOKING_CANCELED_TRAINER: "BOOKING_CANCELED_TRAINER",
  MINOR_PAPER_NEEDED: "MINOR_PAPER_NEEDED",
  BIRTHDAY_ADMIN_PROMPT: "BIRTHDAY_ADMIN_PROMPT",
  BIRTHDAY_CLIENT_GIFT: "BIRTHDAY_CLIENT_GIFT",
  RESERVATION_UNBACKED_ATTENDANCE: "RESERVATION_UNBACKED_ATTENDANCE",
  BULK_RESERVATION_CANCEL_ADMIN: "BULK_RESERVATION_CANCEL_ADMIN",
  BULK_RESERVATION_CANCEL_TRAINER: "BULK_RESERVATION_CANCEL_TRAINER",
  PACKAGE_PURCHASED: "PACKAGE_PURCHASED",
  PACKAGE_ASSIGNED: "PACKAGE_ASSIGNED",
  TRAINER_DAILY_SCHEDULE: "TRAINER_DAILY_SCHEDULE",
} as const satisfies Record<NotificationMessageKey, NotificationMessageKey>;

const messages: Record<
  NotificationMessageKey,
  Record<NotificationLocale, { title: string; body: string }>
> = {
  BOOKING_CONFIRMED: {
    sr: { title: "Rezervacija potvrđena", body: "Vaša rezervacija je potvrđena." },
    en: { title: "Booking confirmed", body: "Your booking has been confirmed." },
  },
  // Operator-facing (trainer roster heads-up). Placeholder-free on purpose:
  // notifyOperators passes only sessionId/status, so any {{var}} here would
  // reach a trainer unfilled. The client-facing variants are the two below.
  SESSION_UPDATED: {
    sr: { title: "Termin ažuriran", body: "Termin je ažuriran." },
    en: { title: "Session updated", body: "The session has been updated." },
  },
  // Client-facing edit where the START did NOT move. States the complete new
  // arrangement rather than a diff, so the row is readable on its own.
  SESSION_DETAILS_UPDATED: {
    sr: {
      title: "Termin je izmenjen",
      body: "{{classTypeName}} {{sessionWhen}} — sala: {{roomName}}, trener: {{trainerFullName}}.",
    },
    en: {
      title: "Your session changed",
      body: "{{classTypeName}} {{sessionWhen}} — room: {{roomName}}, trainer: {{trainerFullName}}.",
    },
  },
  // Client-facing edit where the START moved. The old time is the one detail
  // worth naming against the new one — it is what the client had in their day.
  SESSION_RESCHEDULED: {
    sr: {
      title: "Termin je pomeren",
      body: "{{classTypeName}} je pomeren sa {{oldSessionWhen}} na {{sessionWhen}} — sala: {{roomName}}, trener: {{trainerFullName}}.",
    },
    en: {
      title: "Your session moved",
      body: "{{classTypeName}} moved from {{oldSessionWhen}} to {{sessionWhen}} — room: {{roomName}}, trainer: {{trainerFullName}}.",
    },
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
  // Neutral, static copy: no reason is stated — the studio handles the
  // conversation about WHY. Kept placeholder-free so it can never leak an
  // unfilled {{var}} into the client's inbox.
  PACKAGE_REVOKED: {
    sr: {
      title: "Paket je opozvan",
      body: "Vaš paket je opozvan i budući termini su otkazani. Za više informacija javite nam se.",
    },
    en: {
      title: "Package revoked",
      body: "Your package has been revoked and your upcoming sessions were canceled. Contact us for more information.",
    },
  },
  // The pause is the studio's action, so the copy explains the consequence
  // the client will notice — their reservations are gone — and reassures them
  // the days are not lost. Placeholder-free for the same reason as
  // PACKAGE_REVOKED: an unfilled {{var}} must never reach a client inbox, and
  // the counts/dates ride in the payload for the app to render.
  PACKAGE_PAUSED: {
    sr: {
      title: "Paket je pauziran",
      body: "Vaš paket je pauziran, a rezervacije u tom periodu su otkazane. Trajanje paketa je produženo za dužinu pauze.",
    },
    en: {
      title: "Package paused",
      body: "Your package has been paused and your reservations in that period were canceled. Your package validity was extended by the length of the pause.",
    },
  },
  // An edited window is a second, different disruption: reservations the
  // client made inside the NEW period are gone too, and the expiry date they
  // were told at pause time has moved. Placeholder-free like PACKAGE_PAUSED;
  // the new dates ride in the payload.
  PACKAGE_PAUSE_UPDATED: {
    sr: {
      title: "Pauza je izmenjena",
      body: "Period pauze vašeg paketa je promenjen. Rezervacije u novom periodu su otkazane, a trajanje paketa je preračunato prema novoj dužini pauze.",
    },
    en: {
      title: "Pause updated",
      body: "The pause period of your package has changed. Reservations inside the new period were canceled and your package validity was recalculated for the new pause length.",
    },
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
  // Client paid for a package — reads as a receipt, so it leads with the
  // payment being recorded before naming the now-active package.
  PACKAGE_PURCHASED: {
    sr: {
      title: "Paket je aktivan",
      body: "Uplata je evidentirana — paket {{packageTypeName}} je aktivan.",
    },
    en: {
      title: "Package active",
      body: "Payment recorded — your {{packageTypeName}} package is active.",
    },
  },
  // Package granted to the client (comp / manual assign) — reads as a grant,
  // not a receipt, so it stays free of any payment language.
  PACKAGE_ASSIGNED: {
    sr: {
      title: "Dodeljen vam je paket",
      body: "Dodeljen vam je paket {{packageTypeName}}.",
    },
    en: {
      title: "Package assigned",
      body: "You've been assigned the {{packageTypeName}} package.",
    },
  },
  // One digest per trainer per studio day, not one push per session — a
  // trainer with six classes would otherwise get six separate buzzes for a
  // single workday. Leads with the count, then the first start time, which is
  // the only detail that changes what time they need to be in.
  TRAINER_DAILY_SCHEDULE: {
    sr: {
      title: "Raspored za sutra",
      body: "Sutra imate {{count}} termina, prvi u {{firstStartsAt}}.",
    },
    en: {
      title: "Tomorrow's schedule",
      body: "You have {{count}} sessions tomorrow, starting at {{firstStartsAt}}.",
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

export type BookingEmailKind =
  | "WAITLIST_PROMOTED"
  | "ADMIN_CANCEL"
  | "BULK_CANCEL"
  | "SESSION_UPDATED";

// Client-facing email copy is written in the SECOND PERSON, addressed to the
// recipient directly ("your booking"). It deliberately does NOT reuse the
// admin/trainer notification bodies (e.g. BULK_RESERVATION_CANCEL_ADMIN reads
// "{{count}} reservations canceled for {{clientFullName}}" — third-person, for
// an operator), which would read wrong landing in the client's own inbox.
// BULK_CANCEL keeps {{count}} interpolation; the others need no vars.
// The per-kind copy table carries subject/heading/body; the footer is locale-
// shared and merged in by getBookingEmailContent.
type EmailCopy = { subject: string; heading: string; body: string };
type EmailContent = EmailCopy & {
  footer: string;
  /** Every paragraph of the email, in order — body, then any detail lines. */
  lines: string[];
};

// The opt-out footer is the same line on every booking-change email, but it
// MUST follow the recipient's locale — an en client was getting an sr footer
// because the template hardcoded it.
// Closing reassurance on the cancellation emails. Kept out of the body so a
// bulk cancel can slot the per-session list between the count and this line.
const CONTACT_STUDIO_LINE: Record<NotificationLocale, string> = {
  sr: "Ako misliš da je ovo greška, javi se studiju.",
  en: "If you think this is a mistake, please contact the studio.",
};

const BOOKING_EMAIL_FOOTER: Record<NotificationLocale, string> = {
  sr: "Ovaj email možeš isključiti u podešavanjima obaveštenja u aplikaciji.",
  en: "You can turn this email off in the app's notification settings.",
};

const BOOKING_EMAIL_CONTENT: Record<
  BookingEmailKind,
  Record<NotificationLocale, EmailCopy>
> = {
  WAITLIST_PROMOTED: {
    sr: {
      subject: "Oslobodilo se mesto — rezervacija potvrđena",
      heading: "Tvoja rezervacija je potvrđena",
      body: "Oslobodilo se mesto i prebačen/a si sa liste čekanja — termin je sada tvoj. Vidimo se na treningu!",
    },
    en: {
      subject: "A spot opened — your booking is confirmed",
      heading: "Your booking is confirmed",
      body: "A spot opened up and you've been moved off the waitlist — the session is now yours. See you in class!",
    },
  },
  ADMIN_CANCEL: {
    sr: {
      subject: "Tvoja rezervacija je otkazana",
      heading: "Tvoja rezervacija je otkazana",
      body: "Tvoj termin {{classTypeName}} ({{sessionWhen}}) je otkazan. Ako misliš da je ovo greška, javi se studiju.",
    },
    en: {
      subject: "Your booking was canceled",
      heading: "Your booking was canceled",
      body: "Your {{classTypeName}} session ({{sessionWhen}}) has been canceled. If you think this is a mistake, please contact the studio.",
    },
  },
  BULK_CANCEL: {
    sr: {
      subject: "Tvoje rezervacije su otkazane",
      heading: "Tvoje rezervacije su otkazane",
      body: "Otkazano je {{count}} tvojih termina:",
    },
    en: {
      subject: "Your reservations were canceled",
      heading: "Your reservations were canceled",
      body: "{{count}} of your sessions have been canceled:",
    },
  },
  SESSION_UPDATED: {
    sr: {
      subject: "Tvoj termin je izmenjen",
      heading: "Tvoj termin je izmenjen",
      body: "Tvoj termin {{classTypeName}} sada je {{sessionWhen}} — sala: {{roomName}}, trener: {{trainerFullName}}.",
    },
    en: {
      subject: "Your session was updated",
      heading: "Your session was updated",
      body: "Your {{classTypeName}} session is now {{sessionWhen}} — room: {{roomName}}, trainer: {{trainerFullName}}.",
    },
  },
};

/**
 * Extra paragraphs an email kind can contribute beyond the body — e.g. the
 * per-session list on a bulk cancellation. Passed as its own array, NOT as a
 * `{{var}}`, so each entry stays a separate paragraph instead of collapsing
 * into one run-on line.
 */
export type BookingEmailExtras = { details?: string[] };

/** Resolves the localized, client-voiced email subject + heading + lines. */
export function getBookingEmailContent(
  kind: BookingEmailKind,
  locale: NotificationLocale = "sr",
  vars?: Record<string, string | number | undefined>,
  extras?: BookingEmailExtras,
): EmailContent {
  const content = BOOKING_EMAIL_CONTENT[kind][locale] ?? BOOKING_EMAIL_CONTENT[kind].sr;
  const body = interpolate(content.body, vars);
  const details = extras?.details ?? [];
  const closing =
    kind === "BULK_CANCEL"
      ? [CONTACT_STUDIO_LINE[locale] ?? CONTACT_STUDIO_LINE.sr]
      : [];
  return {
    subject: interpolate(content.subject, vars),
    heading: interpolate(content.heading, vars),
    body,
    lines: body ? [body, ...details, ...closing] : [...details, ...closing],
    footer: BOOKING_EMAIL_FOOTER[locale] ?? BOOKING_EMAIL_FOOTER.sr,
  };
}
