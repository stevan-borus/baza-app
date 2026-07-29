/**
 * E2E: profile health edit-existing flow.
 *
 * Verifies the always-editable layout and the post-save exit:
 *   1. Client records an intake (same setup as the smoke spec).
 *   2. Saving pops back to the profile — the task is done, so the client
 *      doesn't sit on a form with nothing left to do.
 *   3. Re-opening prefills the form; toggling a checkbox marks the draft
 *      dirty → sticky save appears (and is enabled).
 *   4. Saving again returns to the profile.
 *
 * Covers the dirty-detection path: changes to the prefilled form must
 * surface the save action, and a no-op refetch must not show it.
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";

const CLIENT_EMAIL = "client.active.reformer@e2e.test";

test.describe("profile health — edit-existing flow", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("editing a prefilled intake reveals sticky save; saving returns to the profile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, CLIENT_EMAIL, { timeout: 20_000 });
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

    // Saving pops back to the profile — the form is gone, the row is back.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);
    await expect(page.getByTestId("profile-health-row")).toBeVisible();

    // Re-open: the form is still always-editable and now prefilled.
    await page.getByTestId("profile-health-row").click();
    await expect(page.getByTestId("health-intake-form")).toBeVisible();
    // Nothing changed yet, so the sticky save stays hidden.
    await expect(page.getByTestId("profile-health-save")).toHaveCount(0);
    // Wait for the prefill to actually land before touching the form: the
    // intake query is staleTime: 0, so re-entry refetches, and the draft is
    // reseeded from the result — a toggle made before that lands is wiped.
    // The withdraw link only renders once an intake is in hand, so it is the
    // signal that the refetch resolved.
    await expect(page.getByTestId("profile-health-withdraw")).toBeVisible();

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

    // Save → re-fires POST → back to the profile again.
    const editSave = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await page.getByTestId("profile-health-save").click();
    const editResp = await editSave;
    expect(editResp.status()).toBe(200);

    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);
    await expect(page.getByTestId("profile-health-row")).toBeVisible();
  });
});
