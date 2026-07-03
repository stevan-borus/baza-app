/**
 * Katalog tab — verifies the new 5-tab admin layout (Pregled · Katalog ·
 * Klijenti · Naplata · Izveštaji), the Katalog landing's test-ID contract,
 * row navigation, and the hero row opening the new-session sheet.
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";

test.describe("admin (Serbian) — katalog tab", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("admin tab bar shows five tabs with Katalog in position 2", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    // All five tabs render and are arranged in the documented order. The
    // FloatingTabBar gives every tab a testID of `tab-${routeName}`, so
    // reading them in DOM order tells us the source-of-truth order.
    const tabIds = await page
      .locator('[data-testid^="tab-"]')
      .evaluateAll((els) =>
        els
          .map((el) => el.getAttribute("data-testid"))
          .filter((id): id is string => id !== null && id.startsWith("tab-")),
      );

    expect(tabIds).toEqual([
      "tab-pregled",
      "tab-katalog",
      "tab-klijenti",
      "tab-naplata",
      "tab-izvestaji",
    ]);
  });

  test("Katalog landing exposes the hero row and three catalog rows", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();

    await expect(page.getByTestId("katalog-novi-termin")).toBeVisible();
    await expect(page.getByTestId("katalog-row-class-types")).toBeVisible();
    await expect(page.getByTestId("katalog-row-rooms")).toBeVisible();
    await expect(page.getByTestId("katalog-row-package-types")).toBeVisible();
  });

  test("tapping Tipovi treninga row pushes /katalog/tipovi-treninga", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-row-class-types").dispatchEvent("click");
    await page.waitForURL(/\/katalog\/tipovi-treninga$/, { timeout: 10_000 });
  });

  test("tapping Sale row pushes /katalog/sale", async ({ page }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-row-rooms").dispatchEvent("click");
    await page.waitForURL(/\/katalog\/sale$/, { timeout: 10_000 });
  });

  test("tapping Tipovi paketa row pushes /katalog/tipovi-paketa", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();
    await page
      .getByTestId("katalog-row-package-types")
      .dispatchEvent("click");
    await page.waitForURL(/\/katalog\/tipovi-paketa$/, { timeout: 10_000 });
  });

  test("tapping Novi termin opens the new-session sheet", async ({ page }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-novi-termin").dispatchEvent("click");

    // The submit button inside the sheet is the canonical mounted marker.
    await expect(page.getByTestId("session-create-submit")).toBeVisible({
      timeout: 5_000,
    });
  });
});
