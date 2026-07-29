/**
 * E2E: health-intake save path from the profile tab.
 *
 * Flow:
 *   1. Sign in as a client who already cleared the consent gate.
 *   2. Land on home, switch to the profile tab.
 *   3. Tap the Zdravstveni podaci row → pushes /(client)/profile/health.
 *   4. Form is always rendered inline (always-editable layout).
 *   5. Fill the required fields, tap "Sačuvaj izmene".
 *   6. Saving pops back to the profile tab.
 *   7. Re-opening the row shows the form in sync with the saved record —
 *      no sticky save, and the "Povuci saglasnost" link now revealed at
 *      the bottom of the scroll.
 *
 * RN-Web caveat: the Button component renders as <div> with aria-disabled
 * while disabled and strips the attribute when enabled, so we use
 * toHaveAttribute / toHaveCount(0) instead of toBeDisabled / toBeEnabled.
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";

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

  test("client navigates to /health → fills the long-form intake → returns to the profile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Lands on the client home tab (already consented).
    await signInAs(page, CLIENT_EMAIL, { timeout: 20_000 });

    // Switch to the profile tab and tap the Zdravstveni podaci row.
    await page.getByTestId("tab-profile").click();
    const healthRow = page.getByTestId("profile-health-row");
    await expect(healthRow).toBeVisible();
    await healthRow.click();

    // Form is rendered inline (no extra "Add" button now).
    await expect(page.getByTestId("health-intake-form")).toBeVisible();

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

    // Saving returns to the profile — the form unmounts, the row is back.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);
    await expect(healthRow).toBeVisible();

    // Re-opening shows the saved record: no sticky save (draft is clean) and
    // the withdraw link now at the bottom of the scrolled form.
    await healthRow.click();
    await expect(page.getByTestId("health-intake-form")).toBeVisible();
    await expect(page.getByTestId("profile-health-save")).toHaveCount(0);
    await expect(page.getByTestId("profile-health-withdraw")).toBeVisible();
  });
});
