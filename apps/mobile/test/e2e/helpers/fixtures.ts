/**
 * Custom Playwright fixtures.
 *
 * Pins the browser's `Date` to the same anchor instant the dev server
 * is pinned to (via `TEST_ANCHOR_TIME`). Specs import `test` / `expect`
 * (and the usual Playwright type re-exports) from this module so the
 * anchor fixture applies uniformly.
 *
 * See CONTEXT.md → "Anchor time".
 */
import { test as base, expect } from "@playwright/test";

export type { Page, APIResponse, Locator, BrowserContext } from "@playwright/test";

export const ANCHOR_TIME =
  process.env.TEST_ANCHOR_TIME ?? "2026-05-09T10:00:00Z";

export const test = base.extend({
  page: async ({ page }, use) => {
    // Pin the browser clock so client-side `Date.now()` matches the
    // dev server's pinned `now()`. Must run before any page.goto().
    await page.clock.install({ time: new Date(ANCHOR_TIME) });
    await use(page);
  },
});

export { expect };
