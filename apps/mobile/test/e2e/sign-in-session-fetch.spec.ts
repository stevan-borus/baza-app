/**
 * Sign-in when the session check that follows it fails (Serbian).
 *
 * A successful POST /sign-in/email stores the session cookie, then the client
 * confirms it with GET /get-session. When that request dies at the network
 * level, the app used to unmount the whole navigator behind a spinner and
 * remount the sign-in screen empty, with no error. These specs cut that
 * request off in the browser and check the two outcomes the user can see: a
 * failure that persists keeps the typed email and says what went wrong, and a
 * one-off failure is retried and lands the user on their home tab.
 *
 * The route is installed only after the form renders, so the app's bootstrap
 * session fetch has already passed and only the fetches sign-in starts are
 * affected.
 *
 * The next two cover a signed-in user whose background session refetch (on
 * returning to the app) fails: the last known session still counts, both for
 * the tabs they are on and for the root index that routes them home. The last
 * one checks that signing out still ends the session when its refetch fails.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { SEED_PASSWORD, TRAINER_EMAIL } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";
import { completeClientConsent } from "./helpers/consent";

const GET_SESSION = "**/api/auth/get-session**";

/** Seeded without consent records, so sign-in lands on /consent. */
const UNCONSENTED_CLIENT_EMAIL = "client.unconsented@e2e.test";

/**
 * Cuts get-session off from here on and makes better-auth refetch it the way
 * it does when the app returns to the foreground. Resolves once that request
 * has failed in the browser.
 */
async function failSessionRefetch(page: Page) {
  await page.route(GET_SESSION, (route) => route.abort("failed"));
  const failed = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("/api/auth/get-session"),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await failed;
}

async function openSignIn(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByTestId("auth-email-input")
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function submitSignIn(page: Page) {
  await page.getByTestId("auth-email-input").fill(TRAINER_EMAIL);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
}

test.describe("sign-in session fetch failure (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("a session check that keeps failing shows an error and keeps the form", async ({
    page,
  }) => {
    await openSignIn(page);
    await page.route(GET_SESSION, (route) => route.abort("failed"));

    await submitSignIn(page);

    await expect(page.getByTestId("auth-error-message")).toHaveText(
      t.auth.signInSessionError,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("auth-email-input")).toHaveValue(
      TRAINER_EMAIL,
    );
    await expect(page.getByTestId("tab-raspored")).toHaveCount(0);
  });

  test("a session check that fails once is retried and signs the trainer in", async ({
    page,
  }) => {
    await openSignIn(page);
    let aborted = 0;
    await page.route(GET_SESSION, (route) => {
      if (aborted === 0) {
        aborted += 1;
        return route.abort("failed");
      }
      return route.continue();
    });

    await submitSignIn(page);

    await expect(page.getByTestId("tab-raspored")).toBeVisible({
      timeout: 15_000,
    });
    expect(aborted).toBe(1);
  });

  test("a session refetch that fails mid-session keeps the trainer signed in", async ({
    page,
  }) => {
    await openSignIn(page);
    await submitSignIn(page);
    await expect(page.getByTestId("tab-raspored")).toBeVisible({
      timeout: 15_000,
    });

    await failSessionRefetch(page);

    // Navigating after the failed fetch has settled: the trainer is still in.
    await page.getByTestId("tab-zarada").click();
    await expect(page).toHaveURL(/\/zarada$/);
    await expect(page.getByTestId("app-tab-bar")).toBeVisible();
    await expect(page.getByTestId("auth-email-input")).toHaveCount(0);
  });

  test("a failed session refetch does not send a client to sign-in on the way home", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(UNCONSENTED_CLIENT_EMAIL);
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("consent-submit-button")).toBeVisible({
      timeout: 15_000,
    });

    await failSessionRefetch(page);

    // Submitting consent routes through the root index, which decides where a
    // signed-in user belongs from the session it holds.
    await completeClientConsent(page);
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("auth-email-input")).toHaveCount(0);
  });

  test("signing out lands on sign-in even when the session refetch fails", async ({
    page,
  }) => {
    await openSignIn(page);
    await submitSignIn(page);
    await expect(page.getByTestId("tab-raspored")).toBeVisible({
      timeout: 15_000,
    });

    await page.route(GET_SESSION, (route) => route.abort("failed"));
    // Every tab stays mounted, so only the foreground header's button is
    // clickable (see trainer-invite-accept.spec.ts).
    await page
      .locator('[data-testid="open-profile-sheet"]:visible')
      .first()
      .click();
    await page.getByTestId("profile-sign-out-button").click();

    await expect(page.getByTestId("auth-email-input")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("tab-raspored")).toHaveCount(0);
  });
});
