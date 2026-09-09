/**
 * Sign-in lock, end to end (Serbian).
 *
 * The lock is the one auth rule a user meets by accident: five wrong
 * passwords in a quarter hour and the SIXTH attempt is rejected even when the
 * password is right. That is deeply confusing unless the screen says so — a
 * generic "Prijava nije uspela." on a password the user knows is correct is
 * how a studio gets a phone call — so the banner has to switch to the locked
 * copy and name a deadline.
 *
 * The other half is the way out. Waiting 15 minutes is not what a locked
 * trainer standing in the studio will do; an Admin lifts it from Katalog →
 * Treneri. This spec walks the whole loop: lock the trainer out, watch the
 * banner change, have the Admin clear it, then prove the trainer can sign in
 * again with the password that was being rejected a moment ago.
 *
 * Three separate browser contexts, not sign-out: each identity gets clean
 * cookies, and the trainer's final sign-in has to start from no session at
 * all — signing out through the profile screen would couple this spec to a
 * screen it is not testing. Each context installs the anchor clock by hand:
 * the `page` fixture only pins the page IT provides, and BOTH the locked
 * banner ("za N min") and the roster badge compare `lockedUntil` against the
 * browser's own clock, so an unpinned context reads a 15-minute lock as
 * months in the past and renders nothing.
 *
 * `now()` is pinned to TEST_ANCHOR_TIME on the dev server, so the 15-minute
 * lock is 15 minutes past the anchor and cannot expire mid-run. better-auth's
 * own rate limiter and our API throttle are both off outside production, so
 * six rapid attempts are not throttled into a different error.
 */
import { test, expect, ANCHOR_TIME, type Browser, type Page } from "./helpers/fixtures";
import { SEED_PASSWORD, TRAINER_EMAIL, signInAs } from "./helpers/auth";
import { disconnect, getUserIdByEmail, resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

/** Wrong passwords needed to trip the lock (lib/sign-in-lock-rules.ts). */
const MAX_ATTEMPTS = 5;

/** A stable fragment of the locked copy — the minute count varies by run. */
const LOCKED_COPY_FRAGMENT = "privremeno zaključan";

/** A fresh context whose clock matches the dev server's pinned `now()`. */
async function anchoredPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date(ANCHOR_TIME) });
  return page;
}

async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-submit-button").click();
}

test.describe("sign-in lock (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("five wrong passwords lock the trainer, an admin unlocks, the trainer gets back in", async ({
    browser,
  }) => {
    const trainerUserId = await getUserIdByEmail(TRAINER_EMAIL);

    // ── 1. Lock the account out ──────────────────────────────────────────
    const lockPage = await anchoredPage(browser);
    await lockPage.goto("/sign-in");

    const banner = lockPage.getByTestId("auth-error-message");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Each attempt must FINISH before the next fires, or the loop races the
      // requests and the server records fewer failures than this loop made —
      // which shows up much later as "the sixth attempt signed in fine".
      // The banner cannot gate that: from attempt two on it already carries
      // the previous attempt's text, so any assertion on it passes instantly
      // against a stale render. Waiting on THIS attempt's own response is the
      // only state that belongs to this iteration.
      const rejected = lockPage.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/sign-in/email") &&
          response.request().method() === "POST",
        { timeout: 15_000 },
      );
      await submitSignIn(lockPage, TRAINER_EMAIL, `WrongPassword${attempt}!`);
      const response = await rejected;
      // 401 = the password was rejected and the failure was counted. Anything
      // else means this iteration did not do what the loop assumes.
      expect(response.status()).toBe(401);

      await expect(banner).toHaveText(t.auth.signInError, { timeout: 15_000 });

      // Clear the field so the next fill starts from a known state.
      await lockPage.getByTestId("auth-password-input").fill("");
    }

    // ── 2. The CORRECT password is now rejected, and says why ────────────
    const lockedResponse = lockPage.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/sign-in/email") &&
        response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await submitSignIn(lockPage, TRAINER_EMAIL, SEED_PASSWORD);
    // The correct password, refused: the lock outranks it.
    expect((await lockedResponse).status()).toBe(423);

    await expect(banner).toContainText(LOCKED_COPY_FRAGMENT, {
      timeout: 15_000,
    });
    // Still on /sign-in — a locked account does not get a session.
    await expect(lockPage.getByTestId("tab-raspored")).toHaveCount(0);
    await lockPage.context().close();

    // ── 3. An admin lifts the lock from Katalog → Treneri ────────────────
    const adminPage = await anchoredPage(browser);
    await signInAs(adminPage, "admin");

    await adminPage.getByTestId("tab-katalog").click();
    await adminPage.getByTestId("katalog-row-treneri").dispatchEvent("click");

    const badge = adminPage.getByTestId(`tim-locked-badge-${trainerUserId}`);
    await expect(badge).toBeVisible({ timeout: 15_000 });

    await adminPage
      .getByTestId(`tim-unlock-button-${trainerUserId}`)
      .dispatchEvent("click");

    // The badge goes away on its own — the mutation invalidates the roster.
    await expect(badge).toHaveCount(0, { timeout: 15_000 });
    await adminPage.context().close();

    // ── 4. The trainer signs in with the password that was just rejected ─
    const trainerPage = await anchoredPage(browser);
    await signInAs(trainerPage, "trainer");
    await expect(trainerPage.getByTestId("tab-raspored")).toBeVisible({
      timeout: 15_000,
    });
    await trainerPage.context().close();
  });
});
