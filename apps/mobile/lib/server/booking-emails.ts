/**
 * Booking-change transactional email — the low-level send.
 *
 * Given an already-resolved recipient (email + locale), resolves the localized
 * copy and sends. The `notifyClient` dispatcher (lib/server/notify-client.ts)
 * is the only caller: it checks the bookingEmailsEnabled flag and resolves the
 * locale before calling here, so this function does NOT re-check the flag.
 */
import {
  type BookingEmailKind,
  getBookingEmailContent,
  type NotificationLocale,
} from "@baza/i18n";
import { sendBookingChangeEmail } from "@/lib/server/resend";

export async function sendBookingChangeEmailToRecipient(input: {
  to: string;
  kind: BookingEmailKind;
  locale: NotificationLocale;
  vars?: Record<string, string | number | undefined>;
}) {
  const { subject, heading, body, footer } = getBookingEmailContent(
    input.kind,
    input.locale,
    input.vars,
  );
  await sendBookingChangeEmail({
    to: input.to,
    subject,
    heading,
    lines: body ? [body] : [],
    footer,
  });
}
