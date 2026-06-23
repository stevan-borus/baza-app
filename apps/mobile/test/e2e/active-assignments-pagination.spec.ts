/**
 * E2E: ActiveAssignments cursor pagination + server-side search.
 *
 * Navigation: Katalog tab -> Tipovi paketa row -> "Sve aktivne dodele" link
 * (testID `active-assignments-link`). The list defaults to a 20-row page.
 *
 * Mirrors the shape of clients-pagination.spec.ts: scroll the inner
 * ScrollView (not the window) to trigger fetchNextPage, then assert more
 * rows. Type a search query to assert results narrow.
 */
import { test, expect } from "./helpers/fixtures";
import {
  disconnect,
  resetAndSeed,
  seedExtraClientPackages,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";

test.describe.serial("active-assignments pagination (admin)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
    // Push past the default page size of 20 so we have something to scroll
    // into. seedExtraClientPackages mints fresh ClientProfiles internally.
    await seedExtraClientPackages(25);
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("first page bounded by 20, scroll triggers next page, search hits server", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-katalog")).toBeVisible({
      timeout: 15_000,
    });

    // Katalog tab -> Tipovi paketa -> Sve aktivne dodele
    await page.getByTestId("tab-katalog").click();
    await page
      .getByTestId("katalog-row-package-types")
      .dispatchEvent("click");
    await page.waitForURL(/\/katalog\/tipovi-paketa$/, { timeout: 10_000 });
    await page.getByTestId("active-assignments-link").dispatchEvent("click");
    await page.waitForURL(/\/katalog\/aktivne-dodele$/, { timeout: 10_000 });

    // First page is bounded by `take` (default 20). We can't pin an exact
    // count — the seed contributes a handful of packages and the extras
    // round it out — but it should never exceed 20 on the initial load.
    const rows = page.locator('[data-testid^="active-assignment-row-"]');
    await expect(rows.first()).toBeVisible();
    const firstPageCount = await rows.count();
    expect(firstPageCount).toBeLessThanOrEqual(20);
    expect(firstPageCount).toBeGreaterThan(0);

    // Drive the inner ScrollView until fetchNextPage fires. RN-Web throttles
    // onScroll, so re-scroll on each poll iteration.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            const row = document.querySelector(
              '[data-testid^="active-assignment-row-"]',
            );
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
          return await rows.count();
        },
        { timeout: 15_000, intervals: [500, 1000] },
      )
      .toBeGreaterThan(firstPageCount);

    // Server-side search: a unique-by-name seeded extra client. Result count
    // should collapse to ~1 row.
    await page
      .getByTestId("active-assignments-search-input")
      .fill("Pagi Client 007");
    await expect
      .poll(() => rows.count())
      .toBeLessThan(firstPageCount);
    await expect(page.getByText("Pagi Client 007").first()).toBeVisible();
  });
});
