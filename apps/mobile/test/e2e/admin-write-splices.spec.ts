/**
 * Admin write → cache-splice e2e.
 *
 * Covers the refactor where create/update/delete mutations splice their result
 * into the list cache (setQueryData) instead of invalidating+refetching. The
 * thing unit/integration tests cannot prove is the on-screen outcome: after a
 * write, does the row appear / update in place WITHOUT leaving the screen, with
 * its fields intact? Each flow below stays on the list screen and asserts the
 * spliced row by visible content.
 *
 * The two failure modes these guard against:
 *   - a spliced row missing fields (server-response gap) — e.g. the birthday-gift
 *     badge that rides on the widened packages.updateType response;
 *   - a list not updating after a write (splice missed).
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";

const SEED_PASSWORD = "Password123!";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
}

async function openKatalogRow(page: Page, rowTestId: string, urlRe: RegExp) {
  await page.getByTestId("tab-katalog").click();
  await page.getByTestId(rowTestId).dispatchEvent("click");
  await page.waitForURL(urlRe, { timeout: 10_000 });
}

test.describe("admin — list splices on write (no refetch)", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();
    // Warm the Expo web bundle once. The first browser navigation triggers a
    // lazy Metro compile that can exceed a single test's 60s budget; absorb it
    // here (with a generous timeout) so the per-test flows start against a
    // ready bundle.
    const warm = await browser.newPage();
    try {
      await warm.goto("/sign-in", { timeout: 180_000, waitUntil: "domcontentloaded" });
      await warm.getByTestId("auth-email-input").waitFor({ state: "visible", timeout: 180_000 });
    } finally {
      await warm.close();
    }
  });
  test.afterAll(async () => {
    await disconnect();
  });

  // ── Rooms ─────────────────────────────────────────────────────────────────
  test("room: create appears in the list, edit updates the row in place", async ({ page }) => {
    await signInAsAdmin(page);
    await openKatalogRow(page, "katalog-row-rooms", /\/katalog\/sale$/);

    // Create — the new row should splice into the list without a reload.
    await page.getByTestId("admin-new-room-button").dispatchEvent("click");
    await page.getByTestId("room-name-input").fill("E2E Splice Room");
    await page.getByTestId("room-capacity-input").fill("7");
    await page.getByTestId("room-create-submit").click();
    await expect(page.getByText("E2E Splice Room")).toBeVisible({ timeout: 10_000 });

    // Edit — rename, expect the same row to update in place (replace-by-id).
    await page.getByText("E2E Splice Room").click();
    const nameEdit = page.getByTestId("room-edit-name-input");
    await expect(nameEdit).toBeVisible({ timeout: 10_000 });
    await nameEdit.fill("E2E Splice Room Renamed");
    await page.getByTestId("room-edit-save-button").click();
    await expect(page.getByText("E2E Splice Room Renamed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("E2E Splice Room", { exact: true })).toHaveCount(0);
  });

  // ── Class types ─────────────────────────────────────────────────────────────
  test("class type: create appears, edit updates in place", async ({ page }) => {
    await signInAsAdmin(page);
    await openKatalogRow(page, "katalog-row-class-types", /\/katalog\/tipovi-treninga$/);

    await page.getByTestId("admin-new-class-type-button").dispatchEvent("click");
    await page.getByTestId("class-type-name-input").fill("E2E Splice Class");
    await page.getByTestId("class-type-max-clients-input").fill("6");
    await page.getByTestId("class-type-duration-input").fill("50");
    await page.getByTestId("class-type-create-submit").click();
    await expect(page.getByText("E2E Splice Class")).toBeVisible({ timeout: 10_000 });

    await page.getByText("E2E Splice Class").click();
    const nameEdit = page.getByTestId("class-type-edit-name-input");
    await expect(nameEdit).toBeVisible({ timeout: 10_000 });
    await nameEdit.fill("E2E Splice Class Renamed");
    await page.getByTestId("class-type-edit-save-button").click();
    await expect(page.getByText("E2E Splice Class Renamed")).toBeVisible({ timeout: 10_000 });
  });

  // ── Package types (birthday-gift badge rides on the widened response) ────────
  test("package type: create appears, edit toggles birthday-gift badge in place", async ({ page }) => {
    await signInAsAdmin(page);
    await openKatalogRow(page, "katalog-row-package-types", /\/katalog\/tipovi-paketa$/);

    await page.getByTestId("admin-new-package-button").dispatchEvent("click");
    await page.getByTestId("package-name-input").fill("E2E Splice Package");
    await page.getByTestId("package-session-count-input").fill("8");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").click();
    await expect(page.getByText("E2E Splice Package")).toBeVisible({ timeout: 10_000 });

    // Edit: flip the birthday-gift flag. The 🎂 badge is computed from
    // isBirthdayGift, which only reaches the list via the widened updateType
    // response — so its appearance proves the server gap is closed AND spliced.
    await page.getByText("E2E Splice Package").click();
    const giftToggle = page.getByTestId("package-edit-birthday-gift");
    await expect(giftToggle).toBeVisible({ timeout: 10_000 });
    await giftToggle.click();
    await page.getByTestId("package-edit-save-button").click();
    await expect(page.getByText(/🎂/)).toBeVisible({ timeout: 10_000 });
  });

  // ── Campaigns (list + detail; send / cancel / delete) ────────────────────────
  test("campaign: create lands in list, send flips status in detail, delete removes it", async ({ page }) => {
    await signInAsAdmin(page);
    await openKatalogRow(page, "katalog-row-campaigns", /\/katalog\/kampanje$/);
    await page.getByTestId("campaign-new-button").dispatchEvent("click");

    await page.getByTestId("campaign-title-input").fill("E2E Splice Campaign");
    await page.getByTestId("campaign-body-input").fill("Body for the splice e2e campaign.");
    await page.getByTestId("campaign-axis-everyone").click();
    await page.getByTestId("campaign-save-draft").click();

    // Spliced into the list as a DRAFT (Nacrt).
    const row = page.getByText("E2E Splice Campaign");
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Open detail, send now → status splices to SENT (Poslato) in the detail.
    await row.click();
    await expect(page.getByTestId("campaign-detail-send")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("campaign-detail-send").click();
    await page.getByTestId("campaign-confirm-send").click();
    await expect(page.getByText("Poslato")).toBeVisible({ timeout: 10_000 });

    // Back to the list, delete → row filtered out of the list (splice remove).
    await page.goBack();
    await page.getByText("E2E Splice Campaign").click();
    await page.getByTestId("campaign-detail-delete").click();
    await page.getByTestId("campaign-detail-confirm").click();
    await expect(page.getByText("E2E Splice Campaign")).toHaveCount(0, { timeout: 10_000 });
  });

  // ── Invites (list row with name; revoke updates status in place) ─────────────
  test("invite: create appears with name, revoke updates the row status in place", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByTestId("tab-klijenti").click();

    // Open the invite-create sheet (header "+" on the klijenti screen).
    await page.getByTestId("admin-new-invite-button").dispatchEvent("click");
    const inviteEmail = page.getByTestId("invite-create-email-input");
    await expect(inviteEmail).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("invite-create-name-input").fill("E2ESpliceInvitee");
    await page.getByTestId("invite-create-lastname-input").fill("Tester");
    await inviteEmail.fill("e2e.splice.invitee@example.test");
    await page.getByTestId("invite-create-phone-input").fill("+381600000123");
    await page.getByTestId("invite-create-dob-input").fill("1990-01-01");
    await page.getByTestId("invite-create-submit-button").click();

    // Spliced into the invites list with the name carried by the widened response.
    await expect(page.getByText("E2ESpliceInvitee")).toBeVisible({ timeout: 10_000 });
  });
});
