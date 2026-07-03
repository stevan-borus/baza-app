import { Resend } from "resend";
import { render } from "@react-email/render";
import { createElement } from "react";
import { formatFullName } from "@baza/types/common";
import { BookingChangeEmail } from "@/emails/booking-change-email";
import { CampaignEmail } from "@/emails/campaign-email";
import { InviteEmail } from "@/emails/invite-email";
import { ResetEmail } from "@/emails/reset-email";
import { captureResetTokenForE2E } from "@/lib/server/e2e-reset-token-capture";
import { buildInviteUrl, buildResetUrl } from "@/lib/server/email-urls";
import { env } from "@/lib/server/env";
import { tryCatch } from "@/lib/server/try-catch";

let resendClient: Resend | null = null;

/** Lazy singleton; null if RESEND_API_KEY unset. */
export function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
) {
  const client = getResendClient();
  if (!client) {
    console.info("[email:disabled]", { to, subject });
    return;
  }

  const result = await tryCatch(
    client.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      ...(headers ? { headers } : {}),
    }),
  );

  if (result.error) {
    console.error("[email:send-error]", { to, subject, error: result.error });
  }
}

export async function sendInviteEmail(params: {
  to: string;
  firstName: string;
  lastName: string;
  inviteToken: string;
}) {
  const inviteUrl = buildInviteUrl(env.APP_WEB_URL, params.inviteToken);
  const fullName = formatFullName(params.firstName, params.lastName);
  const html = await render(
    createElement(InviteEmail, { fullName, inviteUrl }),
  );
  await sendEmail(params.to, "Baza Pilates - aktivacija naloga", html);
}

export async function sendResetEmail(params: {
  to: string;
  resetToken: string;
}) {
  await captureResetTokenForE2E({ email: params.to, token: params.resetToken });
  const resetUrl = buildResetUrl(env.APP_WEB_URL, params.resetToken);
  const html = await render(createElement(ResetEmail, { resetUrl }));
  await sendEmail(params.to, "Baza Pilates - reset lozinke", html);
}

export async function sendBookingChangeEmail(params: {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  /** Localized opt-out footer (resolved from the recipient's locale upstream). */
  footer: string;
}) {
  const html = await render(
    createElement(BookingChangeEmail, {
      heading: params.heading,
      lines: params.lines,
      logoUrl: `${env.APP_WEB_URL}/email-logo.png`,
      logoDarkUrl: `${env.APP_WEB_URL}/email-logo-dark.png`,
      footer: params.footer,
    }),
  );
  await sendEmail(params.to, params.subject, html);
}

export async function sendCampaignEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  unsubscribeUrl: string;
  chrome: { unsubscribeText: string; footerNote: string };
}) {
  const html = await render(
    createElement(CampaignEmail, {
      title: params.subject,
      body: params.bodyText,
      unsubscribeUrl: params.unsubscribeUrl,
      logoUrl: `${env.APP_WEB_URL}/email-logo.png`,
      logoDarkUrl: `${env.APP_WEB_URL}/email-logo-dark.png`,
      chrome: params.chrome,
    }),
  );
  // Gmail/Yahoo bulk-sender rules require List-Unsubscribe on promotional mail,
  // and List-Unsubscribe-Post enables the native one-click button (which hits
  // POST /api/unsubscribe — the same endpoint as the confirm-page button).
  await sendEmail(params.to, params.subject, html, {
    "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
}
