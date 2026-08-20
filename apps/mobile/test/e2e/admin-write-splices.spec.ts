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
import { signInAs } from "./helpers/auth";
import { createInvite, disconnect, resetAndSeed } from "./helpers/db";

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
    await signInAs(page, "admin");
    await openKatalogRow(page, "katalog-row-rooms", /\/katalog\/sale$/);

    // Create — the new row should splice into the list without a reload.
    await page.getByTestId("admin-new-room-button").dispatchEvent("click");
    await page.getByTestId("room-name-input").fill("E2E Splice Room");
    await page.getByTestId("room-capacity-input").fill("7");
    await page.getByTestId("room-create-submit").click();
    await expect(page.getByText("E2E Splice Room")).toBeVisible();

    // Edit — rename, expect the same row to update in place (replace-by-id).
    await page.getByText("E2E Splice Room").click();
    const nameEdit = page.getByTestId("room-edit-name-input");
    await expect(nameEdit).toBeVisible();
    await nameEdit.fill("E2E Splice Room Renamed");
    await page.getByTestId("room-edit-save-button").click();
    await expect(page.getByText("E2E Splice Room Renamed")).toBeVisible();
    await expect(page.getByText("E2E Splice Room", { exact: true })).toHaveCount(0);
  });

  // ── Class types ─────────────────────────────────────────────────────────────
  test("class type: create appears, edit updates in place", async ({ page }) => {
    await signInAs(page, "admin");
    await openKatalogRow(page, "katalog-row-class-types", /\/katalog\/tipovi-treninga$/);

    await page.getByTestId("admin-new-class-type-button").dispatchEvent("click");
    await page.getByTestId("class-type-name-input").fill("E2E Splice Class");
    await page.getByTestId("class-type-max-clients-input").fill("6");
    await page.getByTestId("class-type-duration-input").fill("50");
    await page.getByTestId("class-type-trial-value-input").fill("1200");
    await page.getByTestId("class-type-create-submit").click();
    await expect(page.getByText("E2E Splice Class")).toBeVisible();

    await page.getByText("E2E Splice Class").click();
    const nameEdit = page.getByTestId("class-type-edit-name-input");
    await expect(nameEdit).toBeVisible();
    await nameEdit.fill("E2E Splice Class Renamed");
    await page.getByTestId("class-type-edit-save-button").click();
    await expect(page.getByText("E2E Splice Class Renamed")).toBeVisible();
  });

  // ── Package types (birthday-gift badge rides on the widened response) ────────
  test("package type: create appears, edit toggles birthday-gift badge in place", async ({ page }) => {
    await signInAs(page, "admin");
    await openKatalogRow(page, "katalog-row-package-types", /\/katalog\/tipovi-paketa$/);

    await page.getByTestId("admin-new-package-button").dispatchEvent("click");
    await page.getByTestId("package-name-input").fill("E2E Splice Package");
    // A package type requires at least one class type — toggle the first chip.
    await page.locator('[data-testid^="package-class-type-chip-"]').first().click();
    await page.getByTestId("package-session-count-input").fill("8");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").click();
    await expect(page.getByText("E2E Splice Package")).toBeVisible();

    // Edit: flip the birthday-gift flag. The 🎂 badge is computed from
    // isBirthdayGift, which only reaches the list via the widened updateType
    // response — so its appearance proves the server gap is closed AND spliced.
    await page.getByText("E2E Splice Package").click();
    const giftToggle = page.getByTestId("package-edit-birthday-gift");
    await expect(giftToggle).toBeVisible();
    await giftToggle.click();
    await page.getByTestId("package-edit-save-button").click();
    await expect(page.getByText(/🎂/)).toBeVisible();
  });

  // ── Campaigns: create splices into list; send splices SENT status into detail ─
  test("campaign: create lands in the list, send flips status to Poslato", async ({ page }) => {
    await signInAs(page, "admin");
    await openKatalogRow(page, "katalog-row-campaigns", /\/katalog\/kampanje$/);
    await page.getByTestId("campaign-new-button").dispatchEvent("click");

    await page.getByTestId("campaign-title-input").fill("E2E Splice Campaign");
    await page.getByTestId("campaign-body-input").fill("Body for the splice e2e campaign.");
    await page.getByTestId("campaign-axis-everyone").click();
    await page.getByTestId("campaign-save-draft").click();

    // Spliced into the list (create) — appears without a refetch.
    const row = page.getByText("E2E Splice Campaign");
    await expect(row).toBeVisible();

    // Open detail, send now → the returned SENT campaign splices into detail.
    await row.click();
    await expect(page.getByTestId("campaign-detail-send")).toBeVisible();
    await page.getByTestId("campaign-detail-send").click();
    await page.getByTestId("campaign-detail-confirm").click();
    await expect(page.getByText("Poslato")).toBeVisible({ timeout: 15_000 });
  });

  // ── Campaigns: delete filters the row out of the list (remove splice) ────────
  test("campaign: deleting a draft removes its row from the list", async ({ page }) => {
    await signInAs(page, "admin");
    await openKatalogRow(page, "katalog-row-campaigns", /\/katalog\/kampanje$/);
    await page.getByTestId("campaign-new-button").dispatchEvent("click");
    await page.getByTestId("campaign-title-input").fill("E2E Delete Campaign");
    await page.getByTestId("campaign-body-input").fill("This draft will be deleted.");
    await page.getByTestId("campaign-axis-everyone").click();
    await page.getByTestId("campaign-save-draft").click();

    const row = page.getByText("E2E Delete Campaign");
    await expect(row).toBeVisible();

    // Delete from the DRAFT detail (SENT is read-only, so deletes only exist here).
    await row.click();
    await page.getByTestId("campaign-detail-delete").click();
    await page.getByTestId("campaign-detail-confirm").click();
    // Router returns to the list; the row is gone (filter-by-id splice).
    await expect(page.getByText("E2E Delete Campaign")).toHaveCount(0, { timeout: 15_000 });
  });

  // ── Invites: revoke splices the updated row status in place ──────────────────
  // The invite-create DOB field is a react-day-picker (known-flaky to drive in
  // e2e — see admin-client-dob.spec), so we seed a PENDING invite directly and
  // exercise the revoke splice: the widened revoke response returns the full row,
  // which replaces the list row in place without a refetch.
  test("invite: revoke updates the row status in place", async ({ page }) => {
    await createInvite({
      email: "e2e.splice.revoke@example.test",
      firstName: "E2ESpliceRevoke",
      lastName: "Tester",
      status: "PENDING",
    });

    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();
    await page.getByTestId("admin-clients-tab-invites").click();

    // The seeded PENDING invite shows in the list (status "Na čekanju").
    await expect(page.getByText("E2ESpliceRevoke")).toBeVisible();
    await expect(page.getByText("Na čekanju")).toBeVisible();

    // Revoke: tap the row's "Povuci" action, confirm "Povuci pozivnicu".
    // The widened revoke response returns the full row, so the status splices
    // to "Povučen" (REVOKED) in place — no refetch.
    await page.getByText("Povuci", { exact: true }).click();
    await page.getByText("Povuci pozivnicu", { exact: true }).click();
    await expect(page.getByText("Povučen")).toBeVisible();
  });
});
