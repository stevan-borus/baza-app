/**
 * E2E: health-intake save path from the profile sheet.
 *
 * The intake used to live on /consent. It moved to a dedicated screen at
 * /(client)/profile/health that the client opens by tapping the avatar
 * and then the "Health info" row. This spec proves the full path:
 *
 *   1. Sign in as a client who already cleared the consent gate.
 *   2. Open the profile sheet from the AppHeader avatar.
 *   3. Tap the "Health info" row — sheet closes, profile/health screen opens.
 *   4. Tap "Add details" → form renders.
 *   5. Fill the six yes/no questions, tap Save.
 *   6. Form collapses into the chips view (intake recorded).
 *
 * RN-Web caveat: the Button component renders as <div> with aria-disabled
 * while disabled and strips the attribute when enabled, so we use
 * toHaveAttribute / toHaveCount(0) instead of toBeDisabled / toBeEnabled.
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
// activeReformer is already past the consent gate (seeded ConsentRecord rows)
// AND has no HealthIntake row, so the "Add details" empty state is the
// expected first render of the profile/health screen.
const CLIENT_EMAIL = "client.active.reformer@e2e.test";

test.describe("health intake — profile flow", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("client opens profile sheet → Health info → fills intake → form collapses to chips", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    // Lands on the client home tab (already consented).
    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 20_000 });

    // Open the profile sheet via the avatar in the AppHeader.
    await page.getByTestId("open-profile-sheet").click();

    // Tap the Health info row — closes sheet, pushes /(client)/profile/health.
    const healthRow = page.getByTestId("profile-health-open");
    await expect(healthRow).toBeVisible({ timeout: 5_000 });
    await healthRow.click();

    // Empty-state Add button is shown on the health screen.
    const addBtn = page.getByTestId("profile-health-add");
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Fill all six intake questions (no follow-up free-text branches).
    await page.getByTestId("q-physicallyActive-yes").click();
    await page.getByTestId("q-firstPilates-yes").click();
    await page.getByTestId("q-complaints-no").click();
    await page.getByTestId("q-injuries-no").click();
    await page.getByTestId("q-pregnant-no").click();
    await page.getByTestId("q-postpartum-no").click();

    // Save is enabled (no Art.17 checkbox here — Save itself is the
    // affirmative action in the profile flow; see HealthIntakeForm props).
    const save = page.getByTestId("profile-health-save");
    await expect(
      page.locator('[data-testid="profile-health-save"][aria-disabled="true"]'),
    ).toHaveCount(0, { timeout: 5_000 });

    // Wait for the POST so React state has settled before we assert the
    // collapsed view (without this the next check can race the request).
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

    // Form collapses → YesNoRow children are gone, chips are rendered.
    await expect(page.getByTestId("q-physicallyActive")).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("profile-health-withdraw")).toBeVisible();
  });
});
