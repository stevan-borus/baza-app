/**
 * E2E: profile health edit-existing flow.
 *
 * Verifies the always-editable layout:
 *   1. Client records an intake (same setup as the smoke spec).
 *   2. After save, the sticky save button is gone and the form is still
 *      mounted (always-editable).
 *   3. Toggling a checkbox marks the draft dirty → sticky save reappears.
 *   4. Saving again hides the button (draft now matches server).
 *
 * Covers the new dirty-detection path: changes to the prefilled form must
 * surface the save action, and a no-op refetch must not show it.
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const CLIENT_EMAIL = "client.active.reformer@e2e.test";

test.describe("profile health — edit-existing flow", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("editing a prefilled intake reveals sticky save; saving hides it again", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("profile-health-row").click();

    // Record an initial intake so subsequent loads have something to prefill.
    await expect(page.getByTestId("health-intake-form")).toBeVisible();
    await page.getByTestId("pilatesExperience-none").click();
    await page.getByTestId("underMedicalTreatment-no").click();
    await page.getByTestId("activityLevel-moderate").click();
    await page.getByTestId("exerciseFrequency-2-3").click();

    const initialSave = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await page.getByTestId("profile-health-save").click();
    await initialSave;

    // Sticky save disappears because draft now matches the saved record.
    await expect(page.getByTestId("profile-health-save")).toHaveCount(0);
    // Form stays mounted (always-editable, not a chip view).
    await expect(page.getByTestId("health-intake-form")).toBeVisible();

    // Toggle a condition the user hadn't selected → draft becomes dirty.
    await page.getByTestId("condition-back_pain").click();
    await expect(page.getByTestId("profile-health-save")).toBeVisible({
      timeout: 5_000,
    });
    // And the save button is enabled (validity holds; only one new checkbox
    // changed). RN-Web aria-disabled is stripped when enabled.
    await expect(
      page.locator('[data-testid="profile-health-save"][aria-disabled="true"]'),
    ).toHaveCount(0, { timeout: 5_000 });

    // Save → re-fires POST → button hides as state returns to clean.
    const editSave = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await page.getByTestId("profile-health-save").click();
    const editResp = await editSave;
    expect(editResp.status()).toBe(200);

    await expect(page.getByTestId("profile-health-save")).toHaveCount(0);
  });
});
