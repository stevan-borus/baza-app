import { test, expect } from "./helpers/fixtures";
import { SEED_PASSWORD } from "./helpers/auth";
import { resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

/**
 * Auth smoke (Serbian).
 *
 * The sign-in flow IS the subject under test here, so each test drives the
 * form explicitly instead of going through helpers/auth.ts:signInAs.
 *
 * The auth-form testIDs (auth-email-input, auth-password-input,
 * auth-submit-button) and tab testIDs (tab-pregled for admin, tab-raspored
 * for trainer, tab-index for client) are wired in sign-in.tsx +
 * lib/tab-layout-theme.tsx.
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

    // Phase 1 admin shell: 4 tabs (Pregled / Klijenti / Naplata / Izveštaji).
    // The landing tab is `pregled` — assert its tab is visible.
    await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
  });

  test("trainer signs in and lands on the trainer landing page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("trainer.reformer@e2e.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    // Trainer landing tab is "raspored" (schedule), not "index".
    await expect(page.getByTestId("tab-raspored")).toBeVisible({ timeout: 15_000 });
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
