/**
 * E2E: admin grants a birthday gift → client receives the bundled "Srećan
 * rođendan!" notification with the package's name, and the resulting
 * ClientPackage carries the invariants we care about.
 *
 * A gift is now a REAL, priced package handed over without payment (isGift)
 * rather than its own unpriced 🎂 SKU — that is what lets trainer payout value
 * the session the client attends on it. The birthday deep-link opens the sheet
 * with the gift toggle already on, and a gift grants ONE session by default
 * even though the package itself holds many.
 *
 * Drives the full flow rather than poking the API directly so we catch any
 * regression in the sheet → submit → notification path.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import {
  clearBirthdayGiftPackageTypes,
  disconnect,
  findBirthdayClientGiftFor,
  findLatestBirthdayGiftPackageFor,
  findPricedPackageTypeFor,
  resetAndSeed,
  setClientBirthdayToToday,
} from "./helpers/db";
import { signInAs } from "./helpers/auth";
import { computePackageExpiresAt } from "@/lib/package-expiry";

const REFORMER_CLIENT_EMAIL = "client.active.reformer@e2e.test";

const CRON_TOKEN =
  process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-admin-bootstrap-token";

async function postCron(page: Page, path: string) {
  const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
  return page.request.post(`${apiBase}${path}`, {
    headers: { "x-cron-token": CRON_TOKEN },
  });
}

test.describe("birthday gift — grant flow", () => {
  let giftPackage: { id: string; name: string; sessionCount: number };

  test.beforeAll(async () => {
    await resetAndSeed();
    // The retired 🎂 SKUs must not be offered any more, so the gift is given
    // on a real priced package.
    await clearBirthdayGiftPackageTypes();
    giftPackage = await findPricedPackageTypeFor("Reformer pilates");
    await setClientBirthdayToToday(REFORMER_CLIENT_EMAIL);
  });

  test.afterAll(async () => {
    await disconnect();
  });

  test("admin taps birthday prompt → grants gift → ClientPackage + BIRTHDAY_CLIENT_GIFT are correct", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Fire the cron so the admin has a row to tap.
    const cronResponse = await postCron(page, "/api/cron/notifications/birthdays");
    expect(cronResponse.status()).toBe(200);

    await signInAs(page, "admin");
    await page.reload();
    await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tab-pregled").click();
    // The bell lives only on the Pregled header; inactive tab screens stay
    // mounted with a hidden copy, so target the *visible* one (`.first()` can
    // resolve to a hidden bell). `:visible` matches the admin.spec.ts idiom.
    const bell = page.locator('[data-testid="notifications-bell-button"]:visible').first();
    await expect(bell).toBeVisible({ timeout: 5_000 });
    await bell.dispatchEvent("click");

    // Tap the reformer's row.
    const reformerRow = page
      .locator('[data-testid^="notification-row-"][data-testid$="-unread"]')
      .filter({ hasText: "Active Reformer Client" })
      .first();
    await expect(reformerRow).toBeVisible({ timeout: 8_000 });
    await reformerRow.dispatchEvent("click");

    // Sheet opens for that client. A birthday deep-link is by definition a
    // gift, so the toggle is already on; the admin picks which real package
    // the gift is drawn from.
    await expect(page).toHaveURL(
      /\/\(admin\)\/klijenti(\?|$)|\/klijenti(\?|$)/,
      { timeout: 8_000 },
    );
    const packageOption = page.getByTestId(
      `assign-package-option-${giftPackage.id}`,
    );
    await expect(packageOption).toBeVisible({ timeout: 8_000 });
    await packageOption.dispatchEvent("click");
    await expect(page.getByTestId("assign-gift-sessions")).toBeVisible({
      timeout: 5_000,
    });

    // Pick today's day in the calendar (mode="date" picker).
    await page.getByTestId("assign-package-start-picker").dispatchEvent("click");
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).toBeVisible();
    const today = String(new Date().getDate());
    await page
      .locator('[data-testid="date-time-picker-calendar"] button.rdp-day_button', {
        hasText: new RegExp(`^${today}$`),
      })
      .first()
      .dispatchEvent("click");
    await page.getByTestId("date-time-picker-confirm").dispatchEvent("click");

    // Submit the grant.
    await page.getByTestId("assign-package-submit").dispatchEvent("click");

    // Wait for the ClientPackage row to appear, then assert the invariants.
    await expect
      .poll(
        async () => {
          const pkg = await findLatestBirthdayGiftPackageFor(REFORMER_CLIENT_EMAIL);
          return pkg?.sessionsRemaining ?? -1;
        },
        { timeout: 10_000 },
      )
      .toBe(1);

    const pkg = await findLatestBirthdayGiftPackageFor(REFORMER_CLIENT_EMAIL);
    expect(pkg).not.toBeNull();
    expect(pkg!.isGift).toBe(true);
    // The REAL package, price intact — that is what makes the session the
    // client attends on it worth something to the trainer.
    expect(pkg!.packageType.name).toBe(giftPackage.name);
    expect(pkg!.packageType.price).not.toBeNull();
    // One session granted, NOT the whole pack.
    expect(pkg!.sessionsRemaining).toBe(1);
    expect(pkg!.sessionsGranted).toBe(1);
    expect(giftPackage.sessionCount).toBeGreaterThan(1);
    // The gift package obeys the same expiry rule as every other package:
    // it opens at the start of its studio day and dies at the close of the
    // last valid one. Asserted through the shared helper rather than
    // re-deriving it, so a change to the rule can't leave this spec behind.
    expect(pkg!.expiresAt.getTime()).toBe(
      computePackageExpiresAt(
        pkg!.startsAt,
        pkg!.packageType.validityDays,
      ).getTime(),
    );

    // The client should now have a BIRTHDAY_CLIENT_GIFT notification with
    // the gift package's name baked into the body.
    await expect
      .poll(
        async () => {
          const notif = await findBirthdayClientGiftFor(REFORMER_CLIENT_EMAIL);
          return notif?.body ?? null;
        },
        { timeout: 10_000 },
      )
      .toContain(giftPackage.name);

    const giftNotif = await findBirthdayClientGiftFor(REFORMER_CLIENT_EMAIL);
    expect(giftNotif).not.toBeNull();
    expect(giftNotif!.title).toContain("Srećan rođendan");
    expect(giftNotif!.body).toContain(giftPackage.name);
    expect(giftNotif!.payload).toMatchObject({
      packageTypeName: giftPackage.name,
      clientPackageId: pkg!.id,
    });
  });
});
