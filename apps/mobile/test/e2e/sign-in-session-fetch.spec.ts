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
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { SEED_PASSWORD, TRAINER_EMAIL } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { t } from "./helpers/locales";

const GET_SESSION = "**/api/auth/get-session**";

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
});
