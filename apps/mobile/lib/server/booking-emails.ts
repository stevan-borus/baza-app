/**
 * Central gate for booking-change transactional emails.
 *
 * Looks up the recipient's email + preferredLocale + bookingEmailsEnabled in a
 * single query. No-ops when the flag is off (the toggle suppresses ONLY email —
 * in-app NotificationLog and push are handled separately and still fire). When
 * enabled, resolves the localized subject/body from @baza/i18n and sends.
 *
 * Call sites use `void sendBookingChangeEmailIfEnabled({...})` — fire-and-forget.
 */
import { type BookingEmailKind, getBookingEmailContent, type NotificationLocale } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";
import { sendBookingChangeEmail } from "@/lib/server/resend";
import { tryCatch } from "@/lib/server/try-catch";

export async function sendBookingChangeEmailIfEnabled(input: {
  userId: string;
  kind: BookingEmailKind;
  vars?: Record<string, string | number | undefined>;
}) {
  const lookup = await tryCatch(
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        email: true,
        notificationPreference: { select: { bookingEmailsEnabled: true, preferredLocale: true } },
      },
    }),
  );
  if (lookup.error || !lookup.data?.email) return;

  const pref = lookup.data.notificationPreference;
  if (pref && pref.bookingEmailsEnabled === false) return;

  const locale: NotificationLocale = pref?.preferredLocale === "en" ? "en" : "sr";
  const { subject, heading, body } = getBookingEmailContent(input.kind, locale, input.vars);

  await sendBookingChangeEmail({
    to: lookup.data.email,
    subject,
    heading,
    lines: body ? [body] : [],
  });
}
