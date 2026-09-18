/**
 * E2E: non-legal question gates on /consent.
 *
 * Proves the Continue button stays DISABLED until the client records a
 * Da/Ne choice for BOTH the social-media and the marketing question — each
 * blocks on its own, and either answer unblocks its own question.
 *
 * Complements consent-gate.spec.ts which covers the happy path with the
 * affirmative answers; this spec isolates the gate state itself (aria-disabled
 * assertions) and verifies that Ne is also a valid recorded decision.
 *
 * Health intake has been removed from /consent — clients add it later from
 * the profile sheet. So social-media and marketing are the only remaining
 * non-legal blockers on this screen.
 */
import { test, expect } from "./helpers/fixtures";
import { SEED_PASSWORD } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";

const CLIENT_EMAIL = "client.unconsented@e2e.test";

test.describe("consent gate — social-media + marketing", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("Continue is disabled until BOTH social-media and marketing are answered; Ne also unblocks them", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("consent-submit-button")).toBeVisible({
      timeout: 15_000,
    });

    // Accept every gate document so the only outstanding blockers are the
    // social-media and marketing questions. (eula is not in the client gate —
    // see GATE_DOCUMENT_KEYS_FOR_ROLE in lib/legal/versions.ts.)
    for (const key of ["tos", "privacy", "waiver_adult"] as const) {
      await page.getByTestId(`document-card-accept-${key}`).click();
    }

    // Intake no longer lives on /consent — assert the form is absent so a
    // regression that reintroduces it would surface here.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);

    // Both questions still unanswered → submit disabled.
    // The StudioButton is a RN-Web <div> exposing aria-disabled rather than
    // a native <button disabled>, so toBeDisabled() doesn't apply; assert
    // the ARIA state directly. When enabled, RN-Web strips the attribute
    // rather than setting it to "false", so the enabled assertion checks
    // for absence via toHaveCount(0) on the attribute-filtered selector.
    const submit = page.getByTestId("consent-submit-button");
    const disabledSubmit = page.locator(
      '[data-testid="consent-submit-button"][aria-disabled="true"]',
    );
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // Tap Ne on social-media — records a row, but marketing still blocks.
    await page.getByTestId("social-media-no").click();
    await expect(page.getByTestId("marketing-consent-question")).toBeVisible();
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // Tap Ne on marketing too — the last blocker clears and Continue opens.
    await page.getByTestId("marketing-consent-no").click();
    await expect(disabledSubmit).toHaveCount(0, { timeout: 5_000 });
  });
});
