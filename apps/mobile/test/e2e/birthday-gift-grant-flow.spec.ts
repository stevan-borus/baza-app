/**
 * E2E: admin grants the birthday Poklon paket → client receives the bundled
 * "Srećan rođendan!" notification with the gift package's name, and the
 * resulting ClientPackage row carries the invariants we care about
 * (sessionsRemaining=1, expiresAt = startsAt + validityDays).
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
  resetAndSeed,
  seedBirthdayGiftPackageType,
  setClientBirthdayToToday,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const ADMIN_EMAIL = "admin.e2e@example.test";
const REFORMER_CLIENT_EMAIL = "client.active.reformer@e2e.test";

const CRON_TOKEN =
  process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-admin-bootstrap-token";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill(ADMIN_EMAIL);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
}

async function postCron(page: Page, path: string) {
  const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
  return page.request.post(`${apiBase}${path}`, {
    headers: { "x-cron-token": CRON_TOKEN },
  });
}

test.describe("birthday gift — grant flow", () => {
  let giftPackageTypeId: string;
  let giftPackageTypeName: string;

  test.beforeAll(async () => {
    await resetAndSeed();
    await clearBirthdayGiftPackageTypes();
    const gift = await seedBirthdayGiftPackageType({
      classTypeName: "Reformer pilates",
      name: "Rođendanski poklon (Reformer)",
    });
    giftPackageTypeId = gift.id;
    giftPackageTypeName = gift.name;
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

    await signInAsAdmin(page);
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

    // Sheet opens for that client with the gift PackageType preselected.
    await expect(page).toHaveURL(
      /\/\(admin\)\/klijenti(\?|$)|\/klijenti(\?|$)/,
      { timeout: 8_000 },
    );
    await expect(
      page.getByTestId(`assign-package-option-${giftPackageTypeId}`),
    ).toBeVisible({ timeout: 8_000 });

    // Pick today's day in the calendar (mode="date" picker).
    await page.getByTestId("assign-package-start-picker").dispatchEvent("click");
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).toBeVisible({ timeout: 10_000 });
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
    expect(pkg!.packageType.isBirthdayGift).toBe(true);
    expect(pkg!.packageType.name).toBe(giftPackageTypeName);
    expect(pkg!.sessionsRemaining).toBe(1);
    // expiresAt = startsAt + validityDays * 24h. Allow ±1 minute for clock
    // skew between the test runner and the server.
    const expectedExpiresMs =
      pkg!.startsAt.getTime() + pkg!.packageType.validityDays * 24 * 60 * 60 * 1000;
    expect(Math.abs(pkg!.expiresAt.getTime() - expectedExpiresMs)).toBeLessThan(60_000);

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
      .toContain(giftPackageTypeName);

    const giftNotif = await findBirthdayClientGiftFor(REFORMER_CLIENT_EMAIL);
    expect(giftNotif).not.toBeNull();
    expect(giftNotif!.title).toContain("Srećan rođendan");
    expect(giftNotif!.body).toContain(giftPackageTypeName);
    expect(giftNotif!.payload).toMatchObject({
      packageTypeName: giftPackageTypeName,
      clientPackageId: pkg!.id,
    });
  });
});
