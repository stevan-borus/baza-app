/**
 * E2E: admin notifications bell + sheet.
 *
 * Test 1 — bell on every admin tab opens the sheet showing the admin's
 *   notification.
 * Test 2 — unread dot appears only when at least one notification is unread.
 *
 * Both tests exercise the NotificationsSheetProvider that wraps the whole
 * admin tab tree in app/(admin)/_layout.tsx. If either fails the provider
 * or the leftSlot wiring for a specific screen is likely incomplete.
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

  // ── Test 1: bell opens sheet from any tab, showing the seeded notification ──

  test("bell on pregled and klijenti tabs opens notifications sheet with seeded notification", async ({
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

    // ── pregled tab ──
    await page.getByTestId("tab-pregled").click();
    // Multiple bell buttons may be in the DOM (inactive tab screens are kept
    // mounted). Use .first() to avoid strict-mode violations.
    await expect(page.getByTestId("notifications-bell-button").first()).toBeVisible({
      timeout: 5_000,
    });
    // dispatchEvent bypasses pointer-events checks — same pattern as other
    // gorhom sheet triggers in admin.spec.ts.
    await page.getByTestId("notifications-bell-button").first().dispatchEvent("click");
    // The notifications sheet opens; wait for a notification row with
    // data-testid^="notification-row-" — this is more reliable than
    // getByText because `numberOfLines={1}` truncates visually but the
    // testID is set unconditionally.
    await expect(
      page.locator('[data-testid^="notification-row-"]').first(),
    ).toBeVisible({ timeout: 8_000 });

    // Close the sheet — press Escape to trigger the dismiss.
    await page.keyboard.press("Escape");

    // ── klijenti tab ──
    // dispatchEvent bypasses pointer-events checks — the gorhom backdrop from
    // the dismissed notifications sheet can briefly linger on web (same issue
    // documented in admin.spec.ts where dispatchEvent is used throughout).
    await page.getByTestId("tab-klijenti").dispatchEvent("click");
    await expect(page.getByTestId("notifications-bell-button").first()).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("notifications-bell-button").first().dispatchEvent("click");
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
