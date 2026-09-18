/**
 * Booking-change transactional email — the low-level send.
 *
 * Given an already-resolved recipient (email + locale), resolves the localized
 * copy and sends. The `notifyClient` dispatcher (lib/server/notify-client.ts)
 * is the only caller: it checks the bookingEmailsEnabled flag and resolves the
 * locale before calling here, so this function does NOT re-check the flag.
 */
import {
  type BookingEmailExtras,
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
  /** Extra paragraphs (e.g. the per-session list on a bulk cancellation). */
  extras?: BookingEmailExtras;
}) {
  const { subject, heading, lines, footer } = getBookingEmailContent(
    input.kind,
    input.locale,
    input.vars,
    input.extras,
  );
  await sendBookingChangeEmail({ to: input.to, subject, heading, lines, footer });
}
