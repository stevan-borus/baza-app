/**
 * E2E: Trainer Clients sticky header.
 *
 * Asserts the search input stays pinned at the top of the screen while the
 * client roster scrolls. Mirrors the shape of clients-pagination and naplata
 * sticky-header specs: capture the search input's Y coordinate before
 * scrolling, drive the inner ScrollView to the bottom, assert Y is unchanged
 * within 2px (RN-Web sub-pixel rounding slack).
 *
 * Previously the search lived in FlatList's ListHeaderComponent, which
 * scrolls away with the rows — this spec is the guardrail for the migration
 * to <PaginatedList> that moved it into a fixed View above the list.
 *
 * Seeds extra trainer-linked clients beyond the rich seed so the list
 * reliably overflows a desktop viewport — without that, "scrolling" wouldn't
 * move anything and the test would be a no-op.
 */
import { test, expect } from "./helpers/fixtures";
import {
  disconnect,
  resetAndSeed,
  seedExtraTrainerLinkedClients,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";
const REFORMER_TRAINER_EMAIL = "trainer.reformer@e2e.test";

test.describe.serial("trainer clients sticky header", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
    // Push enough linked clients into the trainer's roster that the list
    // overflows the viewport. 25 keeps things fast while comfortably
    // exceeding any reasonable desktop list height.
    await seedExtraTrainerLinkedClients(REFORMER_TRAINER_EMAIL, 25);
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("search input stays pinned while the list scrolls", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page
      .getByTestId("auth-email-input")
      .fill(REFORMER_TRAINER_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-clients")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("tab-clients").click();

    const search = page.getByTestId("trainer-clients-search-input");
    await expect(search).toBeVisible({ timeout: 10_000 });
    const rows = page.locator('[data-testid^="trainer-client-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Capture the search input's Y coordinate before scrolling.
    const beforeBox = await search.boundingBox();
    expect(beforeBox).not.toBeNull();

    // Scroll the inner list to the bottom — walk up from a row to find the
    // scrollable ancestor. Same pattern as clients-pagination.spec.ts.
    await page.evaluate(() => {
      const row = document.querySelector(
        '[data-testid^="trainer-client-row-"]',
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

    // Allow one rAF for the scroll to settle.
    await page.waitForTimeout(150);

    const afterBox = await search.boundingBox();
    expect(afterBox).not.toBeNull();
    // 2px slack covers sub-pixel layout rounding on RN-Web.
    expect(Math.abs(afterBox!.y - beforeBox!.y)).toBeLessThan(2);
  });
});
