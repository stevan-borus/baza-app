import { Resend } from "resend";
import { render } from "@react-email/render";
import { createElement } from "react";
import { formatFullName } from "@baza/types";
import { InviteEmail } from "@/emails/invite-email";
import { ResetEmail } from "@/emails/reset-email";
import { captureResetTokenForE2E } from "@/lib/server/e2e-reset-token-capture";
import { env } from "@/lib/server/env";
import { tryCatch } from "@/lib/server/try-catch";

let resendClient: Resend | null = null;

/** Lazy singleton; null if RESEND_API_KEY unset. */
export function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

async function sendEmail(to: string, subject: string, html: string) {
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
  const inviteUrl = `${env.APP_WEB_URL}/auth/activate?token=${encodeURIComponent(params.inviteToken)}`;
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
  const resetUrl = `${env.APP_WEB_URL}/auth/reset-password?token=${encodeURIComponent(params.resetToken)}`;
  const html = await render(createElement(ResetEmail, { resetUrl }));
  await sendEmail(params.to, "Baza Pilates - reset lozinke", html);
}
