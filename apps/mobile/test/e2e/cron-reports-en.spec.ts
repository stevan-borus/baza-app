import { test, expect, type Page, type APIResponse } from "./helpers/fixtures";
import { nowMs } from "../../lib/now";
import {
  createPastSessionWithBooking,
  disconnect,
  getSessionsRemaining,
  resetAndSeed,
} from "./helpers/db";
import { navigateWeekStripTo, nextReformerDayKey } from "./helpers/dates";
import { t, t_en } from "./helpers/locales";

const SEED_PASSWORD = "Password123!";
const REFORMER_TRAINER_EMAIL = "trainer.reformer@e2e.test";
const ACTIVE_REFORMER_CLIENT_EMAIL = "client.active.reformer@e2e.test";

const CRON_TOKEN =
  process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-admin-bootstrap-token";

async function postCron(
  page: Page,
  path: string,
): Promise<APIResponse> {
  const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
  return page.request.post(`${apiBase}${path}`, {
    headers: { "x-cron-token": CRON_TOKEN },
  });
}

test.describe("cron + reports + EN smoke (Serbian + English)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  // ── Reports ───────────────────────────────────────────────────────────────

  test("64: admin reports — attendance section renders", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    // Phase 1 admin shell — landing tab is `pregled`; reports moved to `/izvestaji`.
    await expect(page.getByTestId("tab-pregled")).toBeVisible({
      timeout: 15_000,
    });
    // Phase 1: reports landing is a hub of 4 cards; the utilization breakdown
    // (the closest analogue of "attendance") lives on its own sub-page.
    await page.goto("/izvestaji/iskoriscenost");

    await expect(
      page.getByText(t.admin.manage.utilization).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("65: admin reports — utilization section renders", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({
      timeout: 15_000,
    });
    // Phase 1: revenue lives on its own sub-page; the headline text
    // ("Ukupan prihod") is the closest analogue to the old strip label.
    await page.goto("/izvestaji/prihod");

    await expect(
      page.getByText(t.admin.izvestaji.prihod.headline).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Cron — direct API ─────────────────────────────────────────────────────

  test("66: cron consumes a completed booking (no cancel)", async ({
    page,
  }) => {
    const startsAt = new Date(nowMs() - 2 * 60 * 60 * 1000); // 2h ago
    const { clientPackageId, sessionsRemainingBefore } =
      await createPastSessionWithBooking({
        trainerEmail: REFORMER_TRAINER_EMAIL,
        classTypeName: "Reformer pilates",
        clientEmail: ACTIVE_REFORMER_CLIENT_EMAIL,
        startsAt,
        cancel: "none",
      });

    const response = await postCron(
      page,
      "/api/cron/sessions/consumption?mode=immediate&lookbackHours=24",
    );
    expect(response.status()).toBe(200);

    const after = await getSessionsRemaining(clientPackageId);
    expect(after).toBe(sessionsRemainingBefore - 1);
  });

  test("67: cron skips a pre-cutoff cancellation (no consumption)", async ({
    page,
  }) => {
    const startsAt = new Date(nowMs() - 2 * 60 * 60 * 1000);
    const { clientPackageId, sessionsRemainingBefore } =
      await createPastSessionWithBooking({
        trainerEmail: REFORMER_TRAINER_EMAIL,
        classTypeName: "Reformer pilates",
        clientEmail: ACTIVE_REFORMER_CLIENT_EMAIL,
        startsAt,
        cancel: "before-cutoff",
      });

    const response = await postCron(
      page,
      "/api/cron/sessions/consumption?mode=immediate&lookbackHours=24",
    );
    expect(response.status()).toBe(200);

    const after = await getSessionsRemaining(clientPackageId);
    // Booking was canceled before the cutoff, so the cron should NOT touch
    // sessionsRemaining for this booking.
    expect(after).toBe(sessionsRemainingBefore);
  });

  test("68: cron token enforcement — 401 without x-cron-token", async ({
    page,
  }) => {
    const apiBase =
      process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
    const response = await page.request.post(
      `${apiBase}/api/cron/sessions/consumption`,
      {
        // Missing x-cron-token header.
      },
    );
    expect(response.status()).toBe(401);
  });

  // ── English smoke ─────────────────────────────────────────────────────────

  async function setLocaleEn(page: Page) {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    // Phase 1 admin shell — landing tab is `pregled`.
    await expect(page.getByTestId("tab-pregled")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("open-profile-sheet").click();
    await page.getByTestId("language-en").dispatchEvent("click");
    // Confirm the language flipped.
    await expect(page.getByText("Theme", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    // Sign out so subsequent tests can sign in fresh in EN.
    await page.getByTestId("profile-sign-out-button").click();
    await expect(page).toHaveURL(/\/sign-in/);
  }

  test("EN-1: admin sign-in lands on the admin landing page (English)", async ({
    page,
  }) => {
    await setLocaleEn(page);
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("EN-2: client sign-in + EN calendar renders the next Reformer session", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page
      .getByTestId("auth-email-input")
      .fill(ACTIVE_REFORMER_CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/calendar");
    // Select the next Reformer day so today's weekday doesn't matter.
    await navigateWeekStripTo(page, nextReformerDayKey());

    await expect(page.getByText("Reformer pilates").first()).toBeVisible({
      timeout: 10_000,
    });
    void t_en; // imported for reference; not used directly.
  });

  test("EN-3: trainer sign-in lands on schedule (English)", async ({ page }) => {
    await page.goto("/sign-in");
    await page
      .getByTestId("auth-email-input")
      .fill(REFORMER_TRAINER_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    // Trainer landing tab is "raspored" (schedule), not "index".
    await expect(page.getByTestId("tab-raspored")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("EN-4: client books a session (English)", async ({ page }) => {
    await page.goto("/sign-in");
    await page
      .getByTestId("auth-email-input")
      .fill(ACTIVE_REFORMER_CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/calendar");

    // Pick a Reformer day in the week strip.
    await navigateWeekStripTo(page, nextReformerDayKey());

    // Open booking sheet.
    const block = page.locator('[data-testid^="session-block-"]').first();
    await expect(block).toBeVisible({ timeout: 10_000 });
    await block.dispatchEvent("click");

    await page.getByTestId("booking-book-button").dispatchEvent("click");
    await page
      .getByTestId("booking-confirm-book-button")
      .dispatchEvent("click");

    await expect(
      page.getByTestId("booking-confirmation-banner"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
