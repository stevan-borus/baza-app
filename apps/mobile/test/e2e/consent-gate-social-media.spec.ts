/**
 * E2E: social-media gate on /consent.
 *
 * Proves the Continue button stays DISABLED until the client records a
 * Da/Ne choice — both choices unblock; only an undecided state blocks.
 *
 * Complements consent-gate.spec.ts which covers the happy path with
 * social-media-yes; this spec isolates the gate state itself (assertions
 * on toBeDisabled / toBeEnabled) and verifies that Ne is also a valid
 * recorded decision.
 *
 * Health intake has been removed from /consent — clients add it later from
 * the profile sheet. So the social-media question is the ONLY remaining
 * non-legal blocker on this screen.
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const CLIENT_EMAIL = "client.unconsented@e2e.test";

test.describe("consent gate — social-media", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("Continue is disabled until social-media answered; Ne also unblocks it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("consent-submit-button")).toBeVisible({
      timeout: 15_000,
    });

    // Accept every gate document so the only outstanding blocker is the
    // social-media question. (eula is not in the client gate — see
    // GATE_DOCUMENT_KEYS_FOR_ROLE in lib/legal/versions.ts.)
    for (const key of ["tos", "privacy", "waiver_adult"] as const) {
      await page.getByTestId(`document-card-accept-${key}`).click();
    }

    // Intake no longer lives on /consent — assert the form is absent so a
    // regression that reintroduces it would surface here.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);

    // Social-media still unanswered → submit disabled.
    // The StudioButton is a RN-Web <div> exposing aria-disabled rather than
    // a native <button disabled>, so toBeDisabled() doesn't apply; assert
    // the ARIA state directly. When enabled, RN-Web strips the attribute
    // rather than setting it to "false", so the enabled assertion checks
    // for absence via toHaveCount(0) on the attribute-filtered selector.
    const submit = page.getByTestId("consent-submit-button");
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // Tap Ne — still records a row; should unblock Continue.
    await page.getByTestId("social-media-no").click();
    await expect(
      page.locator('[data-testid="consent-submit-button"][aria-disabled="true"]'),
    ).toHaveCount(0, { timeout: 5_000 });
  });
});
