/**
 * Admin "Novi klijent" (direct create) — regression for the missing DOB field.
 *
 * The create-client form collected email/name/phone but not dateOfBirth, while
 * POST /api/clients validates with inviteClientInputSchema (DOB required) — so
 * every direct create 400'd ("dateOfBirth: expected string, received undefined").
 * This drives the full form including the DOB picker and asserts the new client
 * lands in the list.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { disconnect, resetAndSeed } from "./helpers/db";
import { pickDob } from "./helpers/forms";

const SEED_PASSWORD = "Password123!";

async function signInAsAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill("admin.e2e@example.test");
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("tab-pregled")).toBeVisible({ timeout: 15_000 });
}

test.describe("admin — create client with DOB", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();
    // Warm the Expo web bundle once (cold first-compile can exceed a test budget).
    const warm = await browser.newPage();
    try {
      await warm.goto("/sign-in", { timeout: 180_000, waitUntil: "domcontentloaded" });
      await warm.getByTestId("auth-email-input").waitFor({ state: "visible", timeout: 180_000 });
    } finally {
      await warm.close();
    }
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("creates a client through the form including dateOfBirth", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByTestId("tab-klijenti").click();

    // Clients tab is the default; open the "Novi klijent" sheet.
    await page.getByTestId("admin-new-client-button").dispatchEvent("click");
    await expect(page.getByTestId("client-create-email-input")).toBeVisible();

    await page.getByTestId("client-create-email-input").fill("klijent.novi.e2e@example.test");
    await page.getByTestId("client-create-firstname-input").fill("Novi");
    await page.getByTestId("client-create-lastname-input").fill("Klijent");
    await page.getByTestId("client-create-phone-input").fill("+381600000999");
    await pickDob(page, "client-create-dob-input");

    await page.getByTestId("client-create-submit-button").click();

    // The created client appears in the list (no 400). Assert by the unique
    // email to avoid colliding with the "Novi klijent" sheet title.
    await expect(
      page.getByText("klijent.novi.e2e@example.test"),
    ).toBeVisible();
  });
});
