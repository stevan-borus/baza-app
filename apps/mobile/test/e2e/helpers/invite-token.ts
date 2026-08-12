/**
 * Spec-side reader for the E2E invite-token capture.
 *
 * The raw invite token only ever leaves the server inside an email, so a spec
 * that wants to chain "admin sends the invite" → "invitee opens the deep link"
 * has no other way to learn it. The server writes the latest one to the file
 * named by `E2E_INVITE_TOKEN_FILE` (see lib/server/e2e-invite-token-capture.ts,
 * which no-ops entirely when that var is unset); playwright.config.ts sets the
 * same path on both the webServer command and the runner process, so both
 * sides agree on where to look.
 *
 * Mirrors the reset-token capture the password-reset flow already uses.
 */
import { readFile } from "node:fs/promises";
import { expect } from "./fixtures";

export type CapturedInviteToken = {
  email: string;
  token: string;
  capturedAt: string;
};

function capturePath(): string {
  const configured = process.env.E2E_INVITE_TOKEN_FILE?.trim();
  if (!configured) {
    throw new Error(
      "E2E_INVITE_TOKEN_FILE is not set — playwright.config.ts should define it for both the runner and the webServer.",
    );
  }
  return configured;
}

async function readCaptureFor(email: string): Promise<CapturedInviteToken | null> {
  let raw: string;
  try {
    raw = await readFile(capturePath(), "utf8");
  } catch {
    return null;
  }
  let parsed: CapturedInviteToken;
  try {
    parsed = JSON.parse(raw) as CapturedInviteToken;
  } catch {
    // A partially-flushed write reads as invalid JSON; treat it as "not yet".
    return null;
  }
  return parsed.email === email.toLowerCase() ? parsed : null;
}

/**
 * Poll until the server has captured an invite token for `email`, then return
 * the raw token. Polled rather than read once because POST /api/invites answers
 * the admin's UI before the mail send settles — the row can be on screen a beat
 * before the file exists.
 */
export async function readCapturedInviteToken(email: string): Promise<string> {
  await expect
    .poll(async () => (await readCaptureFor(email))?.token ?? null, {
      timeout: 15_000,
      message: `No invite token captured for ${email}`,
    })
    .not.toBeNull();

  const captured = await readCaptureFor(email);
  if (!captured) throw new Error(`No invite token captured for ${email}`);
  return captured.token;
}
