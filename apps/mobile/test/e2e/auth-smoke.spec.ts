import { test, expect } from "@playwright/test";
import { resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

const SEED_PASSWORD = "Password123!";

/**
 * Auth smoke (Serbian).
 *
 * NOTE: This spec depends on testIDs being present on the auth form's email
 * input, password input, and submit button. The Maestro flows already used
 * `auth-email-input`, `auth-password-input`, `auth-submit-button`. The web
 * build of the Studio sign-in screen does NOT currently set those testIDs
 * (it uses <Input label=... /> with the label rendered as separate <Text>).
 *
 * This selector strategy will resolve once the auth form testIDs are added —
 * tracked in docs/test-plan.md "Deferred tests" section. Until then:
 *   - The spec is scaffolded so the runner discovers + runs once enabled.
 *   - The testID-based locators below match the Phase B Maestro convention.
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
