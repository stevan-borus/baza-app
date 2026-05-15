/**
 * E2E: health-intake save path on /consent.
 *
 * Proves that filling the six yes/no questions and ticking the Art.17
 * consent checkbox enables the Save button; tapping Save then collapses
 * the form into a banner and unblocks the consent-screen Continue button.
 *
 * Complements consent-gate.spec.ts (happy path uses intake-skip) and
 * consent-gate-social-media.spec.ts (isolates the social-media gate).
 *
 * RN-Web caveat: the Save Pressable and Continue StudioButton both
 * render as <div> with aria-disabled="true" while disabled and strip
 * the attribute entirely when enabled — toBeDisabled()/toBeEnabled()
 * don't apply, so we assert via toHaveAttribute + toHaveCount(0).
 */
import { test, expect } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const CLIENT_EMAIL = "client.unconsented@e2e.test";

test.describe("consent gate — health intake save path", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("fill six questions + Art.17 + save → submit enabled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("consent-submit-button")).toBeVisible({
      timeout: 15_000,
    });

    // Accept gate documents + social-media so the only outstanding blocker is
    // the intake.
    for (const key of ["tos", "privacy", "eula", "waiver_adult"] as const) {
      await page.getByTestId(`document-card-accept-${key}`).click();
    }
    await page.getByTestId("social-media-no").click();

    // Fill all six intake questions (no follow-up free-text branches).
    await page.getByTestId("q-physicallyActive-yes").click();
    await page.getByTestId("q-firstPilates-yes").click();
    await page.getByTestId("q-complaints-no").click();
    await page.getByTestId("q-injuries-no").click();
    await page.getByTestId("q-pregnant-no").click();
    await page.getByTestId("q-postpartum-no").click();

    // Without Art.17 ticked, Save stays disabled.
    const save = page.getByTestId("intake-save");
    await expect(save).toHaveAttribute("aria-disabled", "true");

    // Tick Art.17 consent — Save now enabled (attribute stripped).
    await page.getByTestId("intake-consent").click();
    await expect(
      page.locator('[data-testid="intake-save"][aria-disabled="true"]'),
    ).toHaveCount(0, { timeout: 5_000 });

    // Wait for the POST /api/health-intake response so the mutation has
    // settled before we check React state — without this the next assertion
    // can race the in-flight request.
    const intakePost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/health-intake") && r.request().method() === "POST",
    );
    await save.click();
    const intakeResp = await intakePost;
    if (intakeResp.status() !== 200) {
      // Surface the response body so future failures are debuggable rather
      // than just showing "409 vs 200".
      const body = await intakeResp.text();
      throw new Error(
        `POST /api/health-intake returned ${intakeResp.status()}: ${body}`,
      );
    }

    // Form collapses into the saved banner — assert via the testID on the
    // form root: once intakeStatus flips to "saved" the YesNoRow children
    // disappear, so the q-physicallyActive radio group is gone.
    await expect(page.getByTestId("q-physicallyActive")).toHaveCount(0, {
      timeout: 10_000,
    });

    // Continue button on the outer consent screen should now be enabled.
    await expect(
      page.locator(
        '[data-testid="consent-submit-button"][aria-disabled="true"]',
      ),
    ).toHaveCount(0, { timeout: 5_000 });
  });
});
