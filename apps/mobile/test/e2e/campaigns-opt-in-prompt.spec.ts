/**
 * E2E: the one-time marketing opt-in sheet.
 *
 * Serbia requires marketing opt-IN, so `campaignsEnabled` defaults to false
 * and nothing in the app ever asks. This sheet is the ask — shown once per
 * user per device, and never to a client who already answered the marketing
 * question on /consent.
 *
 * client.prompt@e2e.test is the only seeded client with no `marketing`
 * ConsentRecord, so it is the only account the sheet still has a question for.
 * Every other seeded client answered at onboarding (see seedConsentRecords in
 * scripts/test/seed-e2e.ts) and must never see this sheet — that is what keeps
 * the backdrop off the other specs' client screens.
 */
import { test, expect } from "./helpers/fixtures";
import { SEED_PASSWORD } from "./helpers/auth";
import { disconnect, getCampaignsEnabledFor, resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

const CLIENT_EMAIL = "client.prompt@e2e.test";

test.describe("campaigns opt-in prompt", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("declining closes the sheet and frees the screen underneath", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    const sheet = page.getByTestId("campaigns-opt-in-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(t.client.campaignsOptIn.title)).toBeVisible();

    await page.getByTestId("campaigns-opt-in-decline").click();
    await expect(sheet).toHaveCount(0, { timeout: 10_000 });

    // The backdrop is what broke the other client specs — proving a tap lands
    // is the only assertion that proves it is really gone.
    await page.getByTestId("open-profile-sheet").click();
    await expect(page.getByTestId("profile-sheet-display-name")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("accepting turns campaignsEnabled on for that client", async ({
    page,
  }) => {
    await resetAndSeed();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();

    const sheet = page.getByTestId("campaigns-opt-in-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("campaigns-opt-in-accept").click();
    await expect(sheet).toHaveCount(0, { timeout: 10_000 });

    await expect
      .poll(async () => getCampaignsEnabledFor(CLIENT_EMAIL), {
        timeout: 15_000,
      })
      .toBe(true);
  });
});
