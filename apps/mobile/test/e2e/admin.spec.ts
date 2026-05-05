import { test, expect, type Page } from "@playwright/test";
import { disconnect, resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

const SEED_PASSWORD = "Password123!";

/**
 * Admin (Serbian). Test-plan items 12-39.
 *
 * Specs that depend on UI not yet implemented (13/14: ClassType edit/delete,
 * 19/20: Room edit/delete) are skipped with TODOs. Specs that depend on
 * web-incompatible widgets (notably the DateTimePicker, which uses
 * react-native-modal-datetime-picker — no usable web fallback) are skipped
 * with the same convention.
 */
test.describe("admin (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  async function signInAsAdmin(page: Page) {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });
  }

  // ── Catalog ───────────────────────────────────────────────────────────────

  test("12: admin creates a new ClassType", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/class-types");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewClassType })
      .click();
    const name = `E2E ClassType ${Date.now()}`;
    await page.getByTestId("class-type-name-input").fill(name);
    await page.getByTestId("class-type-max-clients-input").fill("8");
    await page.getByTestId("class-type-duration-input").fill("60");
    await page.getByTestId("class-type-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test.skip("13: admin edits a ClassType", () => {
    // TODO: ClassType list rows have no onPress / edit affordance. Add the UI
    // first.
  });
  test.skip("14: admin deletes a ClassType", () => {
    // TODO: same as 13.
  });

  test("15: admin creates a PackageType (with required ClassType picker)", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/packages");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPackage })
      .click();

    const name = `E2E Package ${Date.now()}`;
    await page.getByTestId("package-name-input").fill(name);
    await page
      .getByTestId("package-class-type-select")
      .dispatchEvent("click");
    // Pick the first available class-type option.
    await page
      .locator('[data-testid^="package-class-type-option-"]')
      .first()
      .dispatchEvent("click");
    await page.getByTestId("package-session-count-input").fill("8");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("16: admin edits a PackageType", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/packages");

    // Pick the first package row, edit its name, save.
    const firstRow = page
      .locator('[data-testid^="package-type-row-"]')
      .first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.dispatchEvent("click");

    const newName = `Edited Package ${Date.now()}`;
    const nameInput = page.getByTestId("package-edit-name-input");
    await nameInput.fill(newName);
    await page.getByTestId("package-edit-save-button").dispatchEvent("click");

    await expect(page.getByText(newName).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("17: admin deletes a PackageType (no dependents)", async ({ page }) => {
    // First create a brand-new package with no dependents — guaranteed safe
    // to delete.
    await signInAsAdmin(page);
    await page.goto("/packages");

    const name = `Disposable Package ${Date.now()}`;
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPackage })
      .click();
    await page.getByTestId("package-name-input").fill(name);
    await page
      .getByTestId("package-class-type-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="package-class-type-option-"]')
      .first()
      .dispatchEvent("click");
    await page.getByTestId("package-session-count-input").fill("4");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 10_000,
    });

    // Open it, click delete, confirm in the ConfirmSheet.
    await page.getByText(name).first().dispatchEvent("click");
    await page
      .getByTestId("package-edit-delete-button")
      .dispatchEvent("click");
    await page
      .getByTestId("package-delete-confirm-button")
      .dispatchEvent("click");

    // The row is gone from the list.
    await expect.poll(async () =>
      page.getByText(name).count(),
      { timeout: 10_000 },
    ).toBe(0);
  });

  test("18: admin creates a new StudioRoom", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/rooms");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewRoom })
      .click();
    const name = `E2E Room ${Date.now()}`;
    await page.getByTestId("room-name-input").fill(name);
    await page.getByTestId("room-capacity-input").fill("12");
    await page.getByTestId("room-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test.skip("19: admin edits a StudioRoom", () => {
    // TODO: room rows are read-only. No edit UI.
  });
  test.skip("20: admin deletes a StudioRoom", () => {
    // TODO: same as 19.
  });

  // ── Scheduling ────────────────────────────────────────────────────────────

  test.skip("21: create single session", () => {
    // TODO: react-native-modal-datetime-picker has no usable web fallback,
    // so the spec can't pick a startsAt value through the UI. Add a
    // test-only date input or alias DateTimePicker on web first.
  });
  test.skip("22: edit single session", () => { /* TODO: same DTP issue */ });
  test.skip("23: delete single session", () => { /* TODO: covered by API tests */ });
  test.skip("24: create recurring series", () => { /* TODO: same DTP issue */ });
  test.skip("25: edit single occurrence in series", () => {
    /* TODO: same DTP issue */
  });
  test.skip("26: edit whole series", () => { /* TODO: same DTP issue */ });
  test.skip("27: delete single occurrence", () => { /* TODO: same DTP issue */ });
  test.skip("28: delete whole series", () => { /* TODO: same DTP issue */ });
  test.skip("29: conflict — room double-booked", () => {
    /* TODO: server-side conflict, integration tests cover it */
  });
  test.skip("30: conflict — trainer double-booked", () => {
    /* TODO: integration tests cover it */
  });

  // ── Client management ─────────────────────────────────────────────────────

  test("31: admin sends invite", async ({ page }) => {
    // Already covered by auth-extended.spec.ts. Re-run here in the admin
    // grouping to keep the plan inventory complete and confirm cross-tab
    // navigation continues to work.
    const inviteEmail = `admin-invite.${Date.now()}@e2e.test`;
    await signInAsAdmin(page);
    await page.getByTestId("tab-clients").click();
    await page.getByTestId("admin-clients-tab-invites").click();
    await page
      .getByRole("button", { name: t.admin.clients.sheetInvite })
      .click();
    await page.getByTestId("invite-create-email-input").fill(inviteEmail);
    await page
      .getByTestId("invite-create-name-input")
      .fill("Admin Invite Smoke");
    await page.getByTestId("invite-create-submit-button").click();

    await expect(
      page.getByText(inviteEmail, { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("32: admin client list shows package status badges", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByTestId("tab-clients").click();

    // The seed produces six clients with different package statuses. The
    // badge text comes from i18n. Assert that at least one of each status
    // we can render is visible.
    await expect(
      page.getByText(t.admin.clients.filterActive).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(t.admin.clients.filterExpired).first(),
    ).toBeVisible();
    await expect(
      page.getByText(t.admin.clients.filterPaused).first(),
    ).toBeVisible();
  });

  test.skip("33: admin pauses a client's package", () => {
    // TODO: pause sheet uses placeholder-driven Inputs that overlap with
    // other inputs on the page; needs testID wiring on the pause sheet.
  });

  test.skip("34: admin deactivates a client", () => {
    // TODO: needs full ActionRow → DeleteFor confirm flow assertion. The
    // testIDs are in place; the spec is straightforward to add in a
    // follow-up.
  });

  // ── Billing ───────────────────────────────────────────────────────────────

  test.skip("35: Flow 1 happy — record payment + auto-assign package", () => {
    // TODO: needs testID wiring on the billing-create sheet's Selects.
  });
  test.skip("36: Flow 1 — status defaults to CONFIRMED", () => {
    // TODO: same as 35.
  });
  test.skip("37: record payment without package (drop-in)", () => {
    // TODO: same as 35.
  });
  test.skip("38: Flow 2 — assign comp package directly", () => {
    // TODO: needs testID on assign-package-option (which IS in place) plus
    // an end-to-end click path through the actions sheet.
  });

  test("39: admin sees billing history", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/billing");

    // The seed has no billing records yet, so the screen renders the
    // empty state. We assert the screen loaded by looking for the page
    // title or a known empty-state string. The header sheet button being
    // present is a strong signal.
    await expect(
      page.getByRole("button", { name: t.admin.manage.sheetNewPayment }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
