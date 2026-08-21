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

/**
 * `playwright.config.ts` sets TEST_ANCHOR_TIME before any spec loads, so the
 * env var is the value in every real run and this literal is only a fallback
 * for loading a fixture outside the runner. It must therefore MATCH the
 * config's default: when the two drifted (09 vs 11 May) a stray import would
 * have pinned the browser two days off the server it is asserting against,
 * which is exactly the seed-vs-app anchor divergence this stack has hit
 * before. Change both, or neither.
 */
export const ANCHOR_TIME =
  process.env.TEST_ANCHOR_TIME ?? "2026-05-11T09:00:00Z";

export const test = base.extend({
  page: async ({ page }, use) => {
    // Pin the browser clock so client-side `Date.now()` matches the
    // dev server's pinned `now()`. Must run before any page.goto().
    await page.clock.install({ time: new Date(ANCHOR_TIME) });
    await use(page);
  },
});

export { expect };
