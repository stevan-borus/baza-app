import { test, expect } from "./helpers/fixtures";
import { resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

const SEED_PASSWORD = "Password123!";

/**
 * Auth smoke (Serbian).
 *
 * The auth-form testIDs (auth-email-input, auth-password-input,
 * auth-submit-button) and tab testIDs (tab-clients, tab-index) are wired in
 * sign-in.tsx + lib/tab-layout-theme.tsx.
 */
test.describe("auth smoke (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });

  test("admin signs in and lands on the admin landing page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    // Admin landing route owns these client tabs (per existing testIDs in the
    // Phase B Maestro flows: tab-clients, tab-calendar, tab-notes are in the
    // admin landing).
    await expect(page.getByTestId("tab-clients")).toBeVisible({ timeout: 15_000 });
  });

  test("trainer signs in and lands on the trainer landing page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("trainer.reformer@e2e.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 15_000 });
  });

  test("client signs in and lands on the client home", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("client.active.reformer@e2e.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 15_000 });
  });

  test("wrong password shows the sign-in error message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill("WrongPassword!");
    await page.getByTestId("auth-submit-button").click();

    await expect(page.getByText(t.auth.signInError)).toBeVisible();
  });
});
