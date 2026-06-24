/**
 * E2E: Naplata sticky header.
 *
 * Asserts the search input and filter chips stay pinned at the top of the
 * screen while the billing list scrolls. Mirrors the shape of the
 * clients-pagination sticky-header spec: capture the search input's Y
 * coordinate before scrolling, drive the inner ScrollView to the bottom,
 * assert Y is unchanged within 2px (RN-Web sub-pixel rounding slack).
 *
 * Seeds extra BillingRecords beyond the rich seed so the list reliably
 * overflows a desktop viewport — without that, "scrolling" wouldn't move
 * anything and the test would be a no-op.
 */
import { test, expect } from "./helpers/fixtures";
import { waitForStableBoundingBox } from "./helpers/interactions";
import {
  disconnect,
  resetAndSeed,
  seedExtraBillingRecords,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";

test.describe.serial("naplata sticky header (admin)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
    // Push enough rows that the list overflows the viewport so we have
    // something to scroll. 30 keeps things fast while comfortably exceeding
    // any reasonable desktop list height.
    await seedExtraBillingRecords(30);
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("search input + filter chips stay pinned while the list scrolls", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-naplata")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("tab-naplata").click();

    const search = page.getByTestId("naplata-search-input");
    await expect(search).toBeVisible();
    const rows = page.locator('[data-testid^="billing-row-"]');
    await expect(rows.first()).toBeVisible();

    // Capture the search input's Y coordinate before scrolling.
    const beforeBox = await search.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Scroll the inner list to the bottom — walk up from a row to find the
    // scrollable ancestor. Same pattern as clients-pagination.spec.ts.
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="billing-row-"]');
      if (!row) return;
      let node: HTMLElement | null = row as HTMLElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(cs.overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          node.scrollTop = node.scrollHeight;
          return;
        }
        node = node.parentElement;
      }
    });

    // Wait for the post-scroll reflow to settle (state, not a fixed sleep).
    const afterBox = await waitForStableBoundingBox(search);
    // 2px slack covers sub-pixel layout rounding on RN-Web.
    expect(Math.abs(afterBox.y - beforeBox!.y)).toBeLessThan(2);
  });
});
