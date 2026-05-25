/**
 * E2E: health-intake save path from the profile tab.
 *
 * Flow:
 *   1. Sign in as a client who already cleared the consent gate.
 *   2. Land on home, switch to the profile tab.
 *   3. Tap the Zdravstveni podaci row → pushes /(client)/profile/health.
 *   4. Empty state renders the form inline (no extra tap).
 *   5. Fill the required fields, tap Save.
 *   6. Form collapses into chips view.
 *
 * RN-Web caveat: the Button component renders as <div> with aria-disabled
 * while disabled and strips the attribute when enabled, so we use
 * toHaveAttribute / toHaveCount(0) instead of toBeDisabled / toBeEnabled.
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
// activeReformer is already past the consent gate (seeded ConsentRecord rows)
// AND has no HealthIntake row, so the inline form is rendered immediately.
const CLIENT_EMAIL = "client.active.reformer@e2e.test";

test.describe("health intake — profile flow", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("client navigates to /health → fills the long-form intake → form collapses to chips", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    // Lands on the client home tab (already consented).
    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 20_000 });

    // Switch to the profile tab and tap the Zdravstveni podaci row.
    await page.getByTestId("tab-profile").click();
    const healthRow = page.getByTestId("profile-health-row");
    await expect(healthRow).toBeVisible({ timeout: 10_000 });
    await healthRow.click();

    // Form is rendered inline (no extra "Add" button now).
    await expect(page.getByTestId("health-intake-form")).toBeVisible({
      timeout: 10_000,
    });

    // Minimum required fields: at least one pilates experience, an activity
    // level, an exercise frequency, and an answer to "under medical treatment".
    await page.getByTestId("pilatesExperience-none").click();
    await page.getByTestId("underMedicalTreatment-no").click();
    await page.getByTestId("activityLevel-moderate").click();
    await page.getByTestId("exerciseFrequency-2-3").click();

    const save = page.getByTestId("profile-health-save");
    await expect(
      page.locator('[data-testid="profile-health-save"][aria-disabled="true"]'),
    ).toHaveCount(0, { timeout: 5_000 });

    const intakePost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await save.click();
    const intakeResp = await intakePost;
    if (intakeResp.status() !== 200) {
      const body = await intakeResp.text();
      throw new Error(
        `POST /api/health-intake returned ${intakeResp.status()}: ${body}`,
      );
    }

    // Form collapses → the form node is gone, withdraw button is visible.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("profile-health-withdraw")).toBeVisible();
  });
});
