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
import { signInAs } from "./helpers/auth";
import { waitForStableBoundingBox } from "./helpers/interactions";
import {
  disconnect,
  resetAndSeed,
  seedExtraBillingRecords,
} from "./helpers/db";

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

  test("transaction count shows the full month total on first load, not the page size", async ({
    page,
  }) => {
    await signInAs(page, "admin", { landing: "tab-naplata" });
    await page.getByTestId("tab-naplata").click();

    const rows = page.locator('[data-testid^="billing-row-"]');
    await expect(rows.first()).toBeVisible();
    const firstPageCount = await rows.count();

    // The transaction-count stat comes from the server summary, so on first
    // load it already reflects the whole month (30 seeded + rich-seed rows),
    // not the loaded-pages length. The regression this guards: the count used
    // to equal the rows in memory and only grew as the admin scrolled.
    const countStat = page.getByTestId("naplata-transaction-count");
    const parseCount = async () => {
      const txt = (await countStat.textContent())?.replace(/\D/g, "") ?? "";
      return txt ? parseInt(txt, 10) : null;
    };

    await expect.poll(parseCount).toBeGreaterThan(firstPageCount);
    const totalBeforeScroll = await parseCount();

    // Scroll to load more pages — the count must not change (it was already
    // the full total, not a running tally).
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="billing-row-"]');
      if (!row) return;
      let node: HTMLElement | null = row as HTMLElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) {
          node.scrollTop = node.scrollHeight;
          return;
        }
        node = node.parentElement;
      }
    });
    await expect.poll(() => rows.count()).toBeGreaterThan(firstPageCount);
    expect(await parseCount()).toBe(totalBeforeScroll);
  });

  test("search input + filter chips stay pinned while the list scrolls", async ({
    page,
  }) => {
    await signInAs(page, "admin", { landing: "tab-naplata" });
    await page.getByTestId("tab-naplata").click();

    const search = page.getByTestId("naplata-search-input");
    await expect(search).toBeVisible();
    const rows = page.locator('[data-testid^="billing-row-"]');
    await expect(rows.first()).toBeVisible();

    // Capture the search input's Y coordinate before scrolling — settled, not
    // raw. A raw read races the header's entrance animation and banks a
    // mid-flight Y, which then reads as several px of "drift" after the
    // scroll even though nothing moved. Same guard as the trainer spec.
    const beforeBox = await waitForStableBoundingBox(search);

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
    expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThan(2);
  });
});
