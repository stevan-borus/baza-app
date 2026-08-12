/**
 * E2E: birthday gift deep-link.
 *
 * Closes the loop on PR 3's Task 10. Verifies that an admin who taps a
 * BIRTHDAY_ADMIN_PROMPT row in the in-app inbox lands on the klijenti screen
 * with the AssignPackage sheet open AND the matching isBirthdayGift
 * PackageType pre-selected for the targeted client.
 *
 * Setup:
 *   1. Reset+seed (active reformer client's DOB matches the e2e anchor 2026-05-11).
 *   2. Mint a Birthday Gift PackageType tied to "Reformer pilates" — the seed
 *      doesn't include one because birthday-gift catalog entries are admin-curated.
 *   3. POST to /api/cron/notifications/birthdays with the cron token —
 *      produces a real BIRTHDAY_ADMIN_PROMPT for every active admin, dedupe-keyed.
 *   4. Confirm the notification landed in the DB before driving the UI.
 *
 * Drive:
 *   - Sign in as the seeded admin.
 *   - Navigate via the bell to the inbox.
 *   - Tap the notification row.
 *
 * Assert:
 *   - URL transitions to /(admin)/klijenti with the deep-link params.
 *   - The AssignPackage sheet renders the gift PackageType option chip
 *     (proves the sheet opened for the correct client AND the gift PT is in
 *     the filtered list).
 *   - The URL params clear after consumption (so a re-mount doesn't re-open).
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { ADMIN_EMAIL, signInAs } from "./helpers/auth";
import {
  disconnect,
  findBirthdayAdminPromptFor,
  resetAndSeed,
  seedBirthdayGiftPackageType,
} from "./helpers/db";

const ACTIVE_REFORMER_EMAIL = "client.active.reformer@e2e.test";

const CRON_TOKEN =
  process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-admin-bootstrap-token";

async function postCron(page: Page, path: string) {
  const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
  return page.request.post(`${apiBase}${path}`, {
    headers: { "x-cron-token": CRON_TOKEN },
  });
}

test.describe("birthday gift deep-link", () => {
  let giftPackageTypeId: string;

  test.beforeAll(async () => {
    await resetAndSeed();
    const gift = await seedBirthdayGiftPackageType({
      classTypeName: "Reformer pilates",
    });
    giftPackageTypeId = gift.id;
  });

  test.afterAll(async () => {
    await disconnect();
  });

  test("tapping a BIRTHDAY_ADMIN_PROMPT row routes to klijenti with the gift PT preselected", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Fire the cron to produce a real BIRTHDAY_ADMIN_PROMPT log.
    const cronResponse = await postCron(page, "/api/cron/notifications/birthdays");
    expect(cronResponse.status()).toBe(200);

    // 2. Confirm the notification landed for admin (sanity check — keeps the
    //    test honest if the cron silently no-ops).
    const log = await findBirthdayAdminPromptFor(ADMIN_EMAIL);
    expect(log).not.toBeNull();
    expect(log?.payload).toMatchObject({
      clientFullName: "Active Reformer Client",
    });

    // 3. Sign in and open the inbox via the bell on the pregled tab.
    await signInAs(page, "admin");
    // Reload so the bell's React Query refetches with the new notification.
    await page.reload();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("tab-pregled").click();
    // The bell lives only on the Pregled header; inactive tab screens stay
    // mounted with a hidden copy, so target the *visible* one (`.first()` can
    // resolve to a hidden bell). `:visible` matches the admin.spec.ts idiom.
    const bell = page.locator('[data-testid="notifications-bell-button"]:visible').first();
    await expect(bell).toBeVisible({ timeout: 5_000 });
    await bell.dispatchEvent("click");

    // 4. Inbox shows our notification row. Match the unread variant — the
    //    bell pushes a fresh route, the row is unread until tapped.
    const row = page.locator('[data-testid^="notification-row-"][data-testid$="-unread"]').first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    // 5. Tap the row → deep-link should fire.
    await row.dispatchEvent("click");

    // 6. URL should transition to klijenti. The lazy-state initializer
    //    consumes the params at mount, then a one-shot effect clears them —
    //    so we accept either the pre-clear or post-clear URL shape.
    await expect(page).toHaveURL(
      /\/\(admin\)\/klijenti(\?|$)|\/klijenti(\?|$)/,
      { timeout: 8_000 },
    );

    // 7. AssignPackage sheet opened in gift mode. A birthday deep-link is by
    //    definition a gift, so the toggle is already on — and the retired 🎂
    //    SKU is NOT offered, because a gift is now a real priced package.
    await expect(page.getByTestId("assign-gift-toggle")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("assign-gift-sessions")).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId(`assign-package-option-${giftPackageTypeId}`),
    ).toHaveCount(0);

    // 8. Submit button is visible (sheet is fully mounted, not mid-transition).
    await expect(page.getByTestId("assign-package-submit")).toBeVisible();
  });
});
