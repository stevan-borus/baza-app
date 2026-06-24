/**
 * E2E: profile health withdraw flow — two-tap arming, then actual withdrawal.
 *
 * Setup: the client records a minimal intake first (no seed shortcut for
 * pre-existing intake rows, and the surface intentionally only reveals
 * "Povuci saglasnost" when an intake exists). Then exercises the destructive
 * action:
 *
 *   1. Tap once → button arms (text + bold, red), no server call.
 *   2. Tap again within 3s → DELETE-equivalent withdraw mutation runs.
 *   3. Link hides; revoking again is no longer possible until a new intake
 *      is recorded.
 *
 * The arming window is 3s in source; the spec waits inside it before the
 * second tap.
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const CLIENT_EMAIL = "client.active.reformer@e2e.test";

test.describe("profile health — withdraw flow", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("two-tap arming withdraws the saved intake; link hides afterwards", async ({
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

    // Record a minimal intake so the withdraw link is unlocked.
    await expect(page.getByTestId("health-intake-form")).toBeVisible();
    await page.getByTestId("pilatesExperience-none").click();
    await page.getByTestId("underMedicalTreatment-no").click();
    await page.getByTestId("activityLevel-moderate").click();
    await page.getByTestId("exerciseFrequency-2-3").click();

    const recordPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await page.getByTestId("profile-health-save").click();
    const recordResp = await recordPost;
    expect(recordResp.status()).toBe(200);

    // Save button hides; withdraw link is revealed at the bottom of the form.
    await expect(page.getByTestId("profile-health-save")).toHaveCount(0);
    const withdraw = page.getByTestId("profile-health-withdraw");
    await expect(withdraw).toBeVisible();

    // First tap → arms. No network call yet.
    await withdraw.click();
    // The armed state is verified by checking that the second tap fires the
    // mutation within the arming window. (We avoid asserting exact text since
    // it varies per locale and we already exercise that copy in unit tests.)

    // Second tap within the 3s arming window → fires DELETE.
    const withdrawDelete = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") &&
        r.request().method() === "DELETE",
      { timeout: 5_000 },
    );
    await withdraw.click();
    const withdrawResp = await withdrawDelete;
    expect(withdrawResp.status()).toBeLessThan(400);

    // After withdrawal: the intake is gone, so the withdraw link hides and
    // the empty-state copy reappears at the top of the form.
    await expect(page.getByTestId("profile-health-withdraw")).toHaveCount(0);
    await expect(page.getByTestId("health-intake-form")).toBeVisible();
  });
});
