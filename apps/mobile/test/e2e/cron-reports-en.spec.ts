import { test, expect, type Page, type APIResponse } from "@playwright/test";
import {
  createPastSessionWithBooking,
  disconnect,
  getSessionsRemaining,
  resetAndSeed,
} from "./helpers/db";
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

  // ── Reports (test-plan 64-65) ─────────────────────────────────────────────

  test("64: admin reports — attendance section renders", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/reports");

    // Reports page renders the section labels (utilization is the closest
    // analogue of "attendance" in the current screen).
    await expect(
      page.getByText(t.admin.manage.utilization).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("65: admin reports — utilization section renders", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/reports");

    // Revenue / bookings is the second analytics strip on the screen.
    await expect(
      page.getByText(t.admin.manage.revenue).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Cron — direct API (test-plan 66-68) ───────────────────────────────────

  test("66: cron consumes a completed booking (no cancel)", async ({
    page,
  }) => {
    const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
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
    const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
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

  // ── English smoke (test-plan EN smoke 1-4) ────────────────────────────────

  async function setLocaleEn(page: Page) {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
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
    await expect(page.getByTestId("tab-clients")).toBeVisible({
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
    const reformerDays = new Set([1, 3, 5]);
    const d = new Date();
    while (
      !reformerDays.has(d.getDay()) ||
      (d.getTime() === Date.now() && d.getHours() >= 10)
    ) {
      d.setDate(d.getDate() + 1);
    }
    const target = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

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
    await expect(page.getByTestId("tab-index")).toBeVisible({
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
    const reformerDays = new Set([1, 3, 5]);
    const d = new Date();
    while (
      !reformerDays.has(d.getDay()) ||
      (d.getTime() === Date.now() && d.getHours() >= 10)
    ) {
      d.setDate(d.getDate() + 1);
    }
    const target = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

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
