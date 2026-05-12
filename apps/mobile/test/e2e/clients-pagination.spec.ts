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
import {
  disconnect,
  resetAndSeed,
  seedExtraClients,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";

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
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-klijenti")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("tab-klijenti").click();

    // First page: expect ~20 rows. We can't pin an exact number because the
    // seed contributes 6 clients and ordering is by clientProfile.id ascending,
    // so the visible mix depends on whose profile rows landed first. Assert
    // that the page is bounded by `take` (we set the default to 20).
    const rows = page.locator('[data-testid^="client-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
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
      .poll(() => rows.count(), { timeout: 10_000 })
      .toBeLessThan(firstPageCount);
    await expect(page.getByText("Pagi Client 007").first()).toBeVisible();
  });
});
