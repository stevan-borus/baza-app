/**
 * E2E: Consent gate flow.
 *
 * Tests the full consent-gate lifecycle for a first-time client:
 *   1. Happy path — sign in, get redirected to /consent, accept all docs, land on home.
 *   2. Refusal flow — sign in, refuse, get routed to /sign-in, admin gets notification.
 *   3. Language toggle — /consent renders in SR by default; toggling switches to EN.
 *
 * Gate flag strategy
 * ──────────────────
 * BAZA_CONSENT_GATE_ENABLED=true is set on the webServer command in
 * playwright.config.ts so the dev server reads it at module-load. Setting it
 * inside a beforeAll only affects the Playwright node process, not the server.
 *
 * All users except client.unconsented@e2e.test have ConsentRecord rows
 * seeded (by seedConsentRecords() in seed-e2e.ts) so they pass through the
 * gate. unconsented is intentionally left without consent records — the
 * dedicated gate test subject for the first-time flow.
 *
 * Document keys for an adult unconsented client: tos, privacy, waiver_adult.
 * (waiver_minor only appears when client dateOfBirth < 18 years ago. EULA
 * is intentionally NOT in the gate — see lib/legal/versions.ts.)
 */
import { test, expect, type Page } from "./helpers/fixtures";
import {
  disconnect,
  findConsentRefusedNotificationFor,
  resetAndSeed,
} from "./helpers/db";
import { t, t_en } from "./helpers/locales";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./helpers/auth";

const CLIENT_EMAIL = "client.unconsented@e2e.test";

/**
 * Sign in as the unconsented client. Waits for the redirect to /consent rather
 * than a tab — that is the expected outcome when the gate is enabled and no
 * consent records exist.
 */
async function signInAsUnconsented(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  // The middleware should redirect to /consent.
  await expect(page.getByTestId("consent-submit-button")).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Accept all pending documents on the /consent screen by toggling each Switch.
 * For an adult client the keys are: tos, privacy, waiver_adult.
 */
async function acceptAllDocuments(page: Page) {
  const keys = ["tos", "privacy", "waiver_adult"] as const;
  for (const key of keys) {
    const toggle = page.getByTestId(`document-card-accept-${key}`);
    await expect(toggle).toBeVisible({ timeout: 8_000 });
    // Switches start unchecked; click to check.
    await toggle.click();
  }
}

test.describe("consent gate", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  // ── Test 1: happy path ──────────────────────────────────────────────────────
  test("first-time client is redirected to /consent; accepts all docs; lands on home tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await signInAsUnconsented(page);

    // Verify we're on the consent screen (SR by default).
    await expect(page.getByText(t.consent.welcomeTitle)).toBeVisible();

    // Accept every document.
    await acceptAllDocuments(page);

    // Answer the social-media Da/Ne question — both choices unblock Continue;
    // the gate just requires a recorded decision.
    await page.getByTestId("social-media-yes").click();

    // The /consent screen no longer asks for health intake — it must not
    // render the intake form at all. Clients add health info later, from
    // the profile sheet's Health info row. See profile/health.tsx.
    await expect(page.getByTestId("health-intake-form")).toHaveCount(0);

    // Submit button should now be enabled.
    const submitBtn = page.getByTestId("consent-submit-button");
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // After accept + redirect, we should land on the client home tab.
    await expect(page.getByTestId("tab-index")).toBeVisible({ timeout: 20_000 });
  });

  // ── Test 2: refusal flow ────────────────────────────────────────────────────
  test("refusing consent signs out the client and creates a CONSENT_REFUSED admin notification", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Re-seed so activeReformer is unconsented again (test 1 consumed the rows).
    await resetAndSeed();

    await signInAsUnconsented(page);

    // Press the refuse button (the "Odjavi se" link).
    const refuseBtn = page.getByTestId("consent-refuse-button");
    await expect(refuseBtn).toBeVisible({ timeout: 8_000 });
    await refuseBtn.click();

    // Should be routed back to /sign-in after sign-out.
    await expect(page.getByTestId("auth-submit-button")).toBeVisible({
      timeout: 15_000,
    });

    // The API should have created a CONSENT_REFUSED notification for the admin.
    const notification = await findConsentRefusedNotificationFor(ADMIN_EMAIL);
    expect(notification).not.toBeNull();
    expect(notification!.type).toBe("CONSENT_REFUSED");
  });

  // ── Test 3: language picked on sign-in propagates to /consent ───────────────
  test("language chosen on sign-in propagates to /consent (no toggle on consent screen)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Re-seed so activeReformer is unconsented again.
    await resetAndSeed();

    // Toggle to EN on sign-in BEFORE authenticating.
    await page.goto("/sign-in");
    const toggle = page.getByTestId("auth-language-toggle");
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await toggle.click();

    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    // /consent should now render the EN welcome title — the locale picked on
    // sign-in flows through, no separate toggle on /consent itself.
    await expect(page.getByText(t_en.consent.welcomeTitle)).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(t.consent.welcomeTitle)).toHaveCount(0);
  });
});
