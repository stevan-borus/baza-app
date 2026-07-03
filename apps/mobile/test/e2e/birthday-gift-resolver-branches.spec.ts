/**
 * E2E: birthday cron → suggested-ClassType resolver branches.
 *
 * The resolver (resolveSuggestedClassType) has three branches:
 *   1. Client has an active package          → use that ClassType.
 *   2. No active package, has past bookings  → use most recent booking's ClassType.
 *   3. Neither                                → null (admin picks manually).
 *
 * Branch (1) is already covered by birthday-gift-deep-link.spec.ts — the
 * active-reformer client flow hits it. This spec covers branch (3): a client
 * with no packages and no bookings should still receive a BIRTHDAY_ADMIN_PROMPT,
 * the admin tap should still land in klijenti with the AssignPackage sheet
 * open, but no PackageType is preselected (submit stays disabled until the
 * admin picks one).
 *
 * Branch (2) is exercised by the resolver's unit tests — building the seed
 * scaffold for "no active but past bookings" without disturbing other specs
 * is more invasive than the marginal coverage justifies.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import {
  clearBirthdayGiftPackageTypes,
  disconnect,
  findBirthdayAdminPromptFor,
  resetAndSeed,
  seedBirthdayGiftPackageType,
  setClientBirthdayToToday,
} from "./helpers/db";
import { ADMIN_EMAIL, signInAs } from "./helpers/auth";

const EMPTY_CLIENT_EMAIL = "client.empty@e2e.test";

const CRON_TOKEN =
  process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-admin-bootstrap-token";

async function postCron(page: Page, path: string) {
  const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
  return page.request.post(`${apiBase}${path}`, {
    headers: { "x-cron-token": CRON_TOKEN },
  });
}

test.describe("birthday gift — resolver branches", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
    // Wipe any gift PackageTypes the seed or prior runs left behind so we
    // can prove the empty-client deep-link doesn't preselect anything even
    // though gift PTs exist for OTHER ClassTypes.
    await clearBirthdayGiftPackageTypes();
    // Add a gift PT for "Reformer pilates". The empty client has no package
    // and no bookings — resolver should return null, and the gift's
    // ClassType won't match anything to preselect.
    await seedBirthdayGiftPackageType({ classTypeName: "Reformer pilates" });
    // Force the empty client's DOB to today so the cron picks them up.
    await setClientBirthdayToToday(EMPTY_CLIENT_EMAIL);
  });

  test.afterAll(async () => {
    await disconnect();
  });

  test("client with no active package and no bookings → notification fires, sheet opens with no preselection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Fire the cron. The active-reformer client is also in the matched
    //    set (seed pins their DOB to anchor day), so we'll see >=1 prompt
    //    for admin. We assert on the one that targets the EMPTY client.
    const cronResponse = await postCron(page, "/api/cron/notifications/birthdays");
    expect(cronResponse.status()).toBe(200);

    // 2. There must be a prompt for admin tied to the empty client.
    //    findBirthdayAdminPromptFor returns the most-recent prompt; under
    //    a fresh seed + empty client flipped to today, that's our row.
    const log = await findBirthdayAdminPromptFor(ADMIN_EMAIL);
    expect(log).not.toBeNull();
    // The empty client's full name should be on at least one prompt's
    // payload — fish it out via the DB (helper returns only the latest one,
    // and the latest might be the reformer if the cron emitted both).
    // For a tighter assertion, drive the UI instead and trust the row tap.

    // 3. Sign in and find the row for the empty client.
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

    // The inbox lists rows for all unread prompts. Match the one mentioning
    // "Empty Pack Client" so we tap the right row.
    const emptyRow = page
      .locator('[data-testid^="notification-row-"][data-testid$="-unread"]')
      .filter({ hasText: "Empty Pack Client" })
      .first();
    await expect(emptyRow).toBeVisible({ timeout: 8_000 });
    await emptyRow.dispatchEvent("click");

    // 4. URL transitions to klijenti.
    await expect(page).toHaveURL(
      /\/\(admin\)\/klijenti(\?|$)|\/klijenti(\?|$)/,
      { timeout: 8_000 },
    );

    // 5. Sheet opens (submit button present, sheet not in peeking state)
    //    but is disabled because no PackageType is preselected — resolver
    //    returned null for this client.
    const submit = page.getByTestId("assign-package-submit");
    await expect(submit).toBeVisible({ timeout: 8_000 });
    // The Button is a RN-Web <div role="button">: a disabled state surfaces as
    // `aria-disabled="true"` (+ opacity-40 / pointerEvents:none), NOT the HTML
    // `disabled` attribute, so Playwright's `toBeDisabled()` mis-reports it as
    // enabled. Assert the attribute the app actually sets. The submit is
    // disabled here because the resolver preselected no PackageType for the
    // empty client (`!packageTypeId` → submitDisabled), which is the behavior
    // under test.
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // 6. Tapping any gift PackageType option enables the submit (after the
    //    date is picked too). We don't drive the full submit here — the
    //    no-preselection state is what this test was for.
  });
});
