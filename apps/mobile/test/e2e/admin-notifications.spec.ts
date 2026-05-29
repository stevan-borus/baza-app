/**
 * E2E: admin notifications bell.
 *
 * Test 1 — the bell in the admin header opens the notifications surface
 *   showing the admin's notification.
 * Test 2 — unread dot appears only when at least one notification is unread.
 *
 * Both tests exercise the bell + its leftSlot wiring in the admin header. If
 * either fails, the bell wiring for a specific screen is likely incomplete.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import {
  createNotificationFor,
  disconnect,
  resetAndSeed,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const ADMIN_EMAIL = "admin.e2e@example.test";
const SEEDED_TITLE = "E2E bell test notification";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill(ADMIN_EMAIL);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
}

test.describe("admin notifications bell", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  // ── Test 1: the Pregled bell opens notifications, showing the seeded one ──

  test("the Pregled bell opens notifications with the seeded notification", async ({
    page,
  }) => {
    // Viewport matches the 480px web constraint (use phone dims to be safe).
    await page.setViewportSize({ width: 390, height: 844 });

    await createNotificationFor(ADMIN_EMAIL, {
      title: SEEDED_TITLE,
      body: "This is the body of the E2E test notification.",
    });

    await signInAsAdmin(page);

    // Reload so the bell's query refetches with the newly-seeded notification.
    await page.reload();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });

    // The bell lives only on the Pregled (dashboard) header — other admin tabs
    // use the avatar-only left slot. Target the *visible* bell (inactive tab
    // screens stay mounted with a hidden copy, so `.first()` can resolve to a
    // hidden one); `:visible` mirrors the idiom used across admin.spec.ts.
    await page.getByTestId("tab-pregled").click();
    const bell = page.locator('[data-testid="notifications-bell-button"]:visible').first();
    await expect(bell).toBeVisible({ timeout: 5_000 });
    // dispatchEvent bypasses pointer-events checks — same pattern as other
    // header triggers in admin.spec.ts.
    await bell.dispatchEvent("click");
    // The notifications page opens; wait for a notification row. The testID is
    // set unconditionally, unlike the visually-truncated (`numberOfLines={1}`)
    // title text.
    await expect(
      page.locator('[data-testid^="notification-row-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── Test 2: unread dot state ──

  test("unread dot absent with no notifications, visible after seeding one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Fresh DB — no notifications, so dot must be absent.
    await resetAndSeed();

    await signInAsAdmin(page);
    await page.getByTestId("tab-pregled").click();

    // `not.toBeVisible()` is unreliable when the element doesn't exist at all;
    // use toHaveCount(0) so it passes whether the element is absent OR hidden.
    await expect(
      page.getByTestId("notifications-bell-unread-dot"),
    ).toHaveCount(0);

    // Seed a notification, then reload so the bell query refetches.
    await createNotificationFor(ADMIN_EMAIL, {
      title: "Unread dot test notification",
      body: "Body for dot test.",
    });
    await page.reload();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByTestId("notifications-bell-unread-dot"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
