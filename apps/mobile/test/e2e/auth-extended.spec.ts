import { test, expect } from "./helpers/fixtures";
import { nowMs } from "../../lib/now";
import {
  createInvite,
  createPasswordResetToken,
  disconnect,
  findInviteByEmail,
  findLatestResetTokenFor,
  resetAndSeed,
} from "./helpers/db";
import { t } from "./helpers/locales";
import { signInAs } from "./helpers/auth";
import { pickInviteDob } from "./helpers/forms";

const NEW_PASSWORD = "NewPassword456!";

/**
 * Auth flows beyond the smoke layer:
 *   - sign-out
 *   - admin sends invite; client redeems invite happy path; expired and
 *     used invite tokens
 *   - request password reset; expired reset token
 */
test.describe("auth extended (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("signed-in admin signs out and lands back on /sign-in", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    await page.getByTestId("open-profile-sheet").click();
    await page.getByTestId("profile-sign-out-button").click();

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByTestId("auth-email-input")).toBeVisible();
  });

  test("client opens invite token URL, creates account, and can sign in", async ({
    page,
  }) => {
    const inviteEmail = "new.client.invited@e2e.test";
    const { rawToken } = await createInvite({
      email: inviteEmail,
      fullName: "New Client Invited",
    });

    await page.goto(`/accept-invite?token=${rawToken}`);

    // Desktop UA → no "Get the app" store banner (it's a mobile-web fallback).
    // Guards the Platform/SSR/UA gating in GetAppBanner.
    await expect(page.getByTestId("invite-name-input")).toBeVisible();
    await expect(page.getByTestId("get-app-banner")).toHaveCount(0);

    await page.getByTestId("invite-name-input").fill("New Client Invited");
    await page.getByTestId("invite-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-confirm-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-submit-button").click();

    // Successful redemption sends the user to /sign-in.
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });

    // Now sign in with the freshly-created credentials.
    await page.getByTestId("auth-email-input").fill(inviteEmail);
    await page.getByTestId("auth-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("invited client's first+last name carries through to the profile after activation", async ({
    page,
  }) => {
    // The invite carries firstName/lastName (admin-entered); complete-invite
    // ignores any name typed on the activation form and creates the user from
    // the invite row. A MULTI-PART first name ("Ana Maria") is the regression
    // case: the pre-split greeting heuristic would have dropped "Maria".
    const inviteEmail = "named.invite@e2e.test";
    const { rawToken } = await createInvite({
      email: inviteEmail,
      firstName: "Ana Maria",
      lastName: "Petrović",
    });

    await page.goto(`/accept-invite?token=${rawToken}`);
    await page.getByTestId("invite-name-input").fill("ignored by server");
    await page.getByTestId("invite-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-confirm-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-submit-button").click();

    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    await page.getByTestId("auth-email-input").fill(inviteEmail);
    await page.getByTestId("auth-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 15_000 });

    // The profile sheet renders the derived full name — not the email-local
    // part — and preserves the full multi-part first name.
    await page.getByTestId("open-profile-sheet").click();
    await expect(page.getByTestId("profile-sheet-display-name")).toHaveText(
      "Ana Maria Petrović",
    );
  });

  test("expired invite token shows error UI", async ({ page }) => {
    const { rawToken } = await createInvite({
      email: "expired.invite@e2e.test",
      fullName: "Expired Invite Client",
      expiresAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
    });

    await page.goto(`/accept-invite?token=${rawToken}`);

    // Try to submit with valid form — server should reject because the token
    // is expired.
    await page.getByTestId("invite-name-input").fill("Expired Invite Client");
    await page.getByTestId("invite-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-confirm-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-submit-button").click();

    await expect(page.getByText(t.auth.inviteError)).toBeVisible();
  });

  test("used invite token shows error UI", async ({ page }) => {
    const { rawToken } = await createInvite({
      email: "used.invite@e2e.test",
      fullName: "Used Invite Client",
      status: "COMPLETED",
    });

    await page.goto(`/accept-invite?token=${rawToken}`);

    await page.getByTestId("invite-name-input").fill("Used Invite Client");
    await page.getByTestId("invite-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-confirm-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("invite-submit-button").click();

    await expect(page.getByText(t.auth.inviteError)).toBeVisible();
  });

  test("admin sends invite from clients screen and the invite appears in DB", async ({
    page,
  }) => {
    const inviteEmail = `invite.smoke.${Date.now()}@e2e.test`;
    // Phase 1 admin shell — Klijenti tab is the entry point for invites.
    await signInAs(page, "admin", { landing: "tab-klijenti" });

    await page.getByTestId("tab-klijenti").click();

    // The "+" opens the add-client (invite) sheet directly on any tab.
    await page.getByTestId("admin-new-client-button").click();

    const emailField = page.getByTestId("invite-create-email-input");
    await emailField.fill(inviteEmail);
    await expect(emailField).toHaveValue(inviteEmail);
    // The invite form now takes first + last name separately (both required).
    const firstNameField = page.getByTestId("invite-create-name-input");
    await firstNameField.fill("Invited");
    await expect(firstNameField).toHaveValue("Invited");
    const lastNameField = page.getByTestId("invite-create-lastname-input");
    await lastNameField.fill("Smoke Client");
    await expect(lastNameField).toHaveValue("Smoke Client");
    // DOB is required to enable submit (consent gate, #32). Pick a valid day.
    await pickInviteDob(page);
    await page.getByTestId("invite-create-submit-button").click();

    // Server-side: invite row exists in PENDING state with this email.
    await expect
      .poll(async () => (await findInviteByEmail(inviteEmail))?.status, {
        timeout: 10_000,
      })
      .toBe("PENDING");
  });

  test("password reset request creates a token row and confirms via email", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await page
      .getByTestId("reset-email-input")
      .fill("client.active.reformer@e2e.test");
    await page.getByTestId("reset-send-link-button").click();

    // Success signal is the "check your email" confirmation — the token is
    // never shown; it arrives only via the emailed deep link.
    await expect(page.getByText(t.auth.checkEmail)).toBeVisible();
    await expect(page.getByTestId("reset-token-input")).toHaveCount(0);

    const tokenRow = await findLatestResetTokenFor(
      "client.active.reformer@e2e.test",
    );
    expect(tokenRow).not.toBeNull();
  });

  test("opening the reset deep link shows the new-password step (no token field)", async ({
    page,
  }) => {
    const { rawToken } = await createPasswordResetToken({
      userEmail: "client.active.reformer@e2e.test",
      expiresAt: new Date(nowMs() + 30 * 60 * 1000),
    });

    // The token rides in the URL; the screen consumes it and jumps straight to
    // the password step — the user never sees or types the token.
    await page.goto(`/reset-password?token=${rawToken}`);
    await expect(page.getByTestId("reset-token-input")).toHaveCount(0);

    await page.getByTestId("reset-new-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("reset-submit-button").click();

    await expect(page.getByText(t.auth.passwordUpdated)).toBeVisible();
  });

  test("expired reset token from the deep link shows error UI on submit", async ({
    page,
  }) => {
    const { rawToken } = await createPasswordResetToken({
      userEmail: "client.active.reformer@e2e.test",
      expiresAt: new Date(nowMs() - 60 * 60 * 1000),
    });

    await page.goto(`/reset-password?token=${rawToken}`);
    await page.getByTestId("reset-new-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("reset-submit-button").click();

    await expect(page.getByText(t.auth.resetError)).toBeVisible();
  });
});
