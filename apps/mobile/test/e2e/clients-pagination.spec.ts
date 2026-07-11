/**
 * E2E: Klijenti tab cursor pagination + server-side search.
 *
 * The previous build rendered every client row in one ScrollView and
 * filtered client-side; this spec asserts the new shape:
 *   - Initial load shows only the first page (~20 rows).
 *   - Scrolling to the bottom fetches the next page (more rows appear).
 *   - Typing in the search field issues a server-side query (results shrink
 *     to only the matching rows).
 *
 * Anchors against names seeded by `seedExtraClients` (Pagi Client 001..).
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { waitForStableBoundingBox } from "./helpers/interactions";
import {
  disconnect,
  resetAndSeed,
  seedExtraClients,
} from "./helpers/db";

test.describe.serial("klijenti pagination (admin)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
    // Add enough clients to exceed a single page (default 20).
    await seedExtraClients(25);
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("first page loads, scroll triggers next page, search hits server", async ({
    page,
  }) => {
    await signInAs(page, "admin", { landing: "tab-klijenti" });
    await page.getByTestId("tab-klijenti").click();

    // First page: expect ~20 rows. We can't pin an exact number because the
    // seed contributes 6 clients and ordering is by clientProfile.id ascending,
    // so the visible mix depends on whose profile rows landed first. Assert
    // that the page is bounded by `take` (we set the default to 20).
    const rows = page.locator('[data-testid^="client-row-"]');
    await expect(rows.first()).toBeVisible();
    const firstPageCount = await rows.count();
    expect(firstPageCount).toBeLessThanOrEqual(20);
    expect(firstPageCount).toBeGreaterThan(0);

    // Scroll the inner ScrollView (not the window) until fetchNextPage
    // fires. React Native Web's ScrollView is a div with overflow:auto;
    // walk up from a row to find its scrollable ancestor and drive that.
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="client-row-"]');
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
    // Give the next page a beat to arrive. Re-scroll while polling — RN-Web
    // throttles onScroll, so one event may not be enough to cross the
    // 200px threshold guard in the component.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            const row = document.querySelector('[data-testid^="client-row-"]');
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
          return await rows.count();
        },
        { timeout: 15_000, intervals: [500, 1000] },
      )
      .toBeGreaterThan(firstPageCount);

    // Server-side search: type a query that only matches one of our seeded
    // pagi clients. Result count should collapse to ~1 row.
    await page
      .getByPlaceholder(/search clients|Pretra/i)
      .fill("Pagi Client 007");
    await expect
      .poll(() => rows.count())
      .toBeLessThan(firstPageCount);
    await expect(page.getByText("Pagi Client 007").first()).toBeVisible();
  });

  test("clients tab count shows the full total on first load, not the page size", async ({
    page,
  }) => {
    await signInAs(page, "admin", { landing: "tab-klijenti" });
    await page.getByTestId("tab-klijenti").click();

    const rows = page.locator('[data-testid^="client-row-"]');
    await expect(rows.first()).toBeVisible();
    const firstPageCount = await rows.count();
    // The seed (base + seedExtraClients(25)) exceeds one page, so the total
    // is strictly larger than what's rendered before any scroll.
    expect(firstPageCount).toBeLessThanOrEqual(20);

    // Read the parenthesized count off the "Clients (N)" / "Klijenti (N)"
    // segment label. The regression this guards: N used to equal the loaded-
    // pages length, so on first load it read the page size (20) and only grew
    // as the admin scrolled. It must instead be the server's full total.
    const clientsTab = page.getByTestId("admin-clients-tab-clients");
    const parseCount = async () => {
      const label = (await clientsTab.textContent()) ?? "";
      const m = label.match(/\((\d+)\)/);
      return m ? parseInt(m[1], 10) : null;
    };

    await expect.poll(parseCount).toBeGreaterThan(firstPageCount);
    const totalBeforeScroll = await parseCount();

    // Scroll to load more pages — the count must NOT change (it was already
    // the true total, not a running tally of loaded rows).
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="client-row-"]');
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
    // Same total after more rows loaded.
    expect(await parseCount()).toBe(totalBeforeScroll);
  });

  test("search + filter chips stay pinned while the list scrolls", async ({
    page,
  }) => {
    await signInAs(page, "admin", { landing: "tab-klijenti" });
    await page.getByTestId("tab-klijenti").click();

    const search = page.getByTestId("klijenti-search-input");
    await expect(search).toBeVisible();
    const rows = page.locator('[data-testid^="client-row-"]');
    await expect(rows.first()).toBeVisible();

    // Capture the search input's Y coordinate before scrolling.
    const beforeBox = await search.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Scroll the inner list to the bottom — same pattern as the pagination
    // test above. The sticky header MUST stay at the same Y coordinate.
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="client-row-"]');
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
