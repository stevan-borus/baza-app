import { expect, type Locator } from "./fixtures";

/**
 * Fire a realistic pointer "press" on a react-native-web element that lives
 * inside a mid-animation bottom sheet, bypassing Playwright's actionability
 * gate WITHOUT the unreliability of a bare `click` dispatch.
 *
 * Why not the Playwright-native `locator.click()` (the normally-correct choice
 * for RN-Web, since Pressable binds `onPress` to the DOM `click`)? Because the
 * targets here sit inside a @gorhom/bottom-sheet that is perpetually animating
 * (dynamic-sizing sheets never report "stable"), so `click()`'s actionability
 * gate — "visible, enabled and stable" — never passes and the click times out.
 * Verified: a real `locator.click()` on the DOB picker's day cell fails 6/6 with
 * "element is not stable / not enabled".
 *
 * Why not a bare `el.dispatchEvent("click")` (what the suite used before)? It
 * reaches the DOM but only intermittently drives RN-Web's press responder, so
 * `onPress` fires some runs and not others — the source of several flakes where
 * a tap "did nothing" (no navigation / no network request / no sheet dismiss):
 * the click event landed every run, but the handler ran only intermittently.
 *
 * Dispatching the full `pointerdown → pointerup → click` sequence (what a real
 * user produces) both bypasses the never-settling actionability gate AND drives
 * the responder deterministically. This is the documented last-resort path for
 * "native methods provably can't fire the handler", not a gratuitous bypass.
 */
export async function pressRNW(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    const opts = { bubbles: true, cancelable: true, composed: true } as const;
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  });
}

/**
 * Resolve once a locator's bounding box has stopped moving — i.e. two
 * consecutive reads agree within `tolerance` px. Returns the settled box.
 *
 * Replaces the `await page.waitForTimeout(150)` "let the scroll settle" sleeps
 * the sticky-header specs used: a fixed sleep is both too long on a quiet
 * machine and too short under sustained suite load (the post-scroll reflow can
 * outlast it, flaking the assertion). Polling the actual quantity we care about
 * — the element's Y position — is the state-based wait Playwright recommends
 * over `waitForTimeout`. `expect.poll` retries against the configured expect
 * timeout, so a settled box returns immediately and a never-settling one fails
 * with a real diagnostic instead of a silent bad read.
 */
export async function waitForStableBoundingBox(
  locator: Locator,
  tolerance = 0.5,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let prev = await locator.boundingBox();
  await expect
    .poll(async () => {
      const next = await locator.boundingBox();
      const stable =
        !!next &&
        !!prev &&
        Math.abs(next.y - prev.y) < tolerance &&
        Math.abs(next.x - prev.x) < tolerance;
      prev = next;
      return stable;
    })
    .toBe(true);
  // `prev` now holds the last (settled) read.
  return prev as { x: number; y: number; width: number; height: number };
}
