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

const SEED_PASSWORD = "Password123!";
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
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });

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

    await expect(page.getByText(t.auth.inviteError)).toBeVisible({
      timeout: 10_000,
    });
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

    await expect(page.getByText(t.auth.inviteError)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin sends invite from clients screen and the invite appears in DB", async ({
    page,
  }) => {
    const inviteEmail = `invite.smoke.${Date.now()}@e2e.test`;
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("tab-clients").click();

    // Switch to "Invites" tab and open the invite-create header button.
    await page.getByTestId("admin-clients-tab-invites").click();
    await page
      .getByRole("button", { name: t.admin.clients.sheetInvite })
      .click();

    const emailField = page.getByTestId("invite-create-email-input");
    await emailField.fill(inviteEmail);
    await expect(emailField).toHaveValue(inviteEmail);
    const nameField = page.getByTestId("invite-create-name-input");
    await nameField.fill("Invited Smoke Client");
    await expect(nameField).toHaveValue("Invited Smoke Client");
    await page.getByTestId("invite-create-submit-button").click();

    // Server-side: invite row exists in PENDING state with this email.
    await expect
      .poll(async () => (await findInviteByEmail(inviteEmail))?.status, {
        timeout: 10_000,
      })
      .toBe("PENDING");
  });

  test("password reset request creates a token row for the user", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await page
      .getByTestId("reset-email-input")
      .fill("client.active.reformer@e2e.test");
    await page.getByTestId("reset-send-link-button").click();

    // Step 2 (token + new password) is now visible — that's the success
    // signal from the request side.
    await expect(page.getByTestId("reset-token-input")).toBeVisible({
      timeout: 10_000,
    });

    // And a row exists in the DB.
    const tokenRow = await findLatestResetTokenFor(
      "client.active.reformer@e2e.test",
    );
    expect(tokenRow).not.toBeNull();
  });

  test("expired reset token shows error UI on submit", async ({ page }) => {
    const { rawToken } = await createPasswordResetToken({
      userEmail: "client.active.reformer@e2e.test",
      expiresAt: new Date(nowMs() - 60 * 60 * 1000),
    });

    await page.goto("/reset-password");
    // Skip from "request" to "reset" step via the haveToken link.
    await page.getByText(t.auth.haveToken).click();
    await page.getByTestId("reset-token-input").fill(rawToken);
    await page.getByTestId("reset-new-password-input").fill(NEW_PASSWORD);
    await page.getByTestId("reset-submit-button").click();

    await expect(page.getByText(t.auth.resetError)).toBeVisible({
      timeout: 10_000,
    });
  });
});
