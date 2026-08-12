/**
 * Trainer invites — the admin onboards a trainer from Katalog → Procenti
 * trenera, and that invite stays OFF the client-scoped Klijenti surface.
 *
 * Two claims only e2e can settle: the invite the admin sends from the trainer
 * roster actually lands in the roster's own "Pozivnice" list (role round-trips
 * through the API and back into the shared invites cache), and the Klijenti
 * invites tab filters it out, so a trainer never reads as a pending client.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { createInvite, disconnect, resetAndSeed } from "./helpers/db";
import { pressRNW } from "./helpers/interactions";

const TRAINER_INVITE_EMAIL = "e2e-trainer-invite@test.local";
const TRAINER_INVITE_FIRST = "E2ETrainerInvite";
const TRAINER_INVITE_LAST = "Kandidat";

// A CLIENT invite the seed does not provide. It is the control: the Klijenti
// invites tab must still show it, which is what makes the trainer's absence
// there an actual filter and not an empty list.
const CLIENT_INVITE_EMAIL = "e2e-client-invite@test.local";
const CLIENT_INVITE_FIRST = "E2EClientInvite";

async function openProcentiTrenera(page: Page) {
  await page.getByTestId("tab-katalog").click();
  await page.getByTestId("katalog-row-trainer-rates").dispatchEvent("click");
  await page.waitForURL(/\/katalog\/procenti-trenera$/, { timeout: 10_000 });
}

test.describe("admin — trainer invites", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();
    await createInvite({
      email: CLIENT_INVITE_EMAIL,
      firstName: CLIENT_INVITE_FIRST,
      lastName: "Tester",
      status: "PENDING",
    });
    // Warm the Expo web bundle once — the first navigation triggers a lazy
    // Metro compile that can outlast a single test's budget.
    const warm = await browser.newPage();
    try {
      await warm.goto("/sign-in", {
        timeout: 180_000,
        waitUntil: "domcontentloaded",
      });
      await warm
        .getByTestId("auth-email-input")
        .waitFor({ state: "visible", timeout: 180_000 });
    } finally {
      await warm.close();
    }
  });

  test.afterAll(async () => {
    await disconnect();
  });

  test("inviting a trainer from Procenti trenera lists them under Pozivnice, not under Klijenti", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await openProcentiTrenera(page);

    // The trainer roster owns the onboarding entry point.
    await pressRNW(page.getByTestId("trainer-invite-open-button"));
    await expect(page.getByTestId("invite-trainer-submit-button")).toBeVisible({
      timeout: 10_000,
    });

    // Reduced form: no DOB, phone optional (left empty here).
    await page.getByTestId("invite-trainer-email-input").fill(TRAINER_INVITE_EMAIL);
    await page.getByTestId("invite-trainer-name-input").fill(TRAINER_INVITE_FIRST);
    await page.getByTestId("invite-trainer-lastname-input").fill(TRAINER_INVITE_LAST);
    await pressRNW(page.getByTestId("invite-trainer-submit-button"));

    // The new invite splices into the roster's own Pozivnice list, pending.
    const inviteRow = page
      .locator('[data-testid^="trainer-invite-row-"]')
      .filter({ hasText: TRAINER_INVITE_FIRST });
    await expect(inviteRow).toHaveCount(1, { timeout: 15_000 });
    await expect(inviteRow).toContainText(TRAINER_INVITE_EMAIL);
    await expect(inviteRow).toContainText("Na čekanju");

    // Klijenti's invites tab is client-scoped: the trainer must not show up.
    await page.getByTestId("tab-klijenti").click();
    await page.getByTestId("admin-clients-tab-invites").click();

    // Scope the absence to Klijenti's own invite rows. A bare page-wide
    // getByText would still find the trainer in the Procenti trenera screen
    // that expo-router keeps mounted (hidden) behind this tab.
    const klijentiInviteRows = page.locator('[data-testid^="invite-row-"]');
    // The seeded CLIENT invite proves the tab actually rendered rows before we
    // assert an absence — otherwise an empty list would pass vacuously.
    await expect(
      klijentiInviteRows.filter({ hasText: CLIENT_INVITE_FIRST }),
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(
      klijentiInviteRows.filter({ hasText: TRAINER_INVITE_EMAIL }),
    ).toHaveCount(0);
    await expect(
      klijentiInviteRows.filter({ hasText: TRAINER_INVITE_FIRST }),
    ).toHaveCount(0);
    // And the tab's own count agrees: one client invite, trainer excluded.
    await expect(page.getByTestId("admin-clients-tab-invites")).toContainText(
      "(1)",
    );
  });
});
