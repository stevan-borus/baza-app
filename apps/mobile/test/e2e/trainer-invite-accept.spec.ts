/**
 * Trainer onboarding, end to end — the admin sends the invite from Treneri and
 * the invited person actually becomes a working trainer on the agreed percent.
 *
 * `trainer-invite.spec.ts` stops at the admin's pending row, and the CLIENT
 * acceptance spec starts from an invite the DB helper planted. Neither one
 * settles the claim the studio owner actually cares about: that the token the
 * server minted for a UI-created TRAINER invite redeems into a signed-in
 * trainer whose first rate is already the percent the admin promised. The
 * seam between "invite sent" and "invite accepted" is exactly where a role or
 * a percent can be dropped without any existing test noticing.
 *
 * The raw token never leaves the server except by email, so the spec reads it
 * from the E2E-only capture file (`E2E_INVITE_TOKEN_FILE`, set on the
 * webServer command in playwright.config.ts) — the same mechanism the reset
 * flow already uses for its token.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { pressRNW } from "./helpers/interactions";
import { readCapturedInviteToken } from "./helpers/invite-token";
import { t } from "./helpers/locales";

// Unique per run: the journey creates a real User, and a re-run against an
// unreset DB would otherwise 409 on the duplicate email.
const TRAINER_EMAIL = `e2e-trainer-accept-${Date.now()}@test.local`;
const TRAINER_FIRST = "Nova";
const TRAINER_LAST = "Trenerka";
const TRAINER_PERCENT = "45";
const TRAINER_PASSWORD = "TrainerPass123!";

async function openTreneri(page: Page) {
  await page.getByTestId("tab-katalog").click();
  await page.getByTestId("katalog-row-treneri").dispatchEvent("click");
  await page.waitForURL(/\/katalog\/treneri$/, { timeout: 10_000 });
}

/**
 * Sign out of whoever is currently signed in, from a tab root.
 *
 * The `:visible` filter is load-bearing: expo-router keeps every tab screen
 * mounted, so `open-profile-sheet` matches one node per tab and only the
 * foreground one is clickable. Callers must be on a tab root first — a pushed
 * detail screen (Treneri) renders a back chevron instead of the profile button,
 * and its header would swallow the click aimed at a backgrounded tab's.
 */
async function signOut(page: Page) {
  await page
    .locator('[data-testid="open-profile-sheet"]:visible')
    .first()
    .click();
  await page.getByTestId("profile-sign-out-button").click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
}

test.describe("trainer invite — full chain (send → accept → rate live)", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();
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

  test("an invite sent from Treneri is redeemed by the trainer, who lands in the trainer app on the promised percent", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ── 1. Admin sends the invite from the trainer roster ───────────────────
    await signInAs(page, "admin");
    await openTreneri(page);

    await pressRNW(page.getByTestId("trainer-invite-open-button"));
    await expect(page.getByTestId("invite-trainer-submit-button")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("invite-trainer-email-input").fill(TRAINER_EMAIL);
    await page.getByTestId("invite-trainer-name-input").fill(TRAINER_FIRST);
    await page.getByTestId("invite-trainer-lastname-input").fill(TRAINER_LAST);
    await page.getByTestId("invite-trainer-percent-input").fill(TRAINER_PERCENT);
    await pressRNW(page.getByTestId("invite-trainer-submit-button"));

    const inviteRow = page
      .locator('[data-testid^="trainer-invite-row-"]')
      .filter({ hasText: TRAINER_EMAIL });
    await expect(inviteRow).toHaveCount(1, { timeout: 15_000 });
    await expect(inviteRow).toContainText(t.admin.clients.inviteStatusPending);

    // ── 2. Take the token the way the trainer would: out of the email ───────
    // Polled, not read once: the route answers the admin before the mail send
    // resolves, so the row can be on screen a beat before the file lands.
    const rawToken = await readCapturedInviteToken(TRAINER_EMAIL);

    // ── 3. Sign out — the invitee is a different person on a clean session ──
    // Back to a tab root first: Treneri is a pushed detail screen whose header
    // has no profile button.
    await page.getByTestId("tab-pregled").click();
    await signOut(page);

    // ── 4. The trainer opens the deep link and sets a password ──────────────
    await page.goto(`/accept-invite?token=${rawToken}`);
    await expect(page.getByTestId("invite-name-input")).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByTestId("invite-name-input")
      .fill(`${TRAINER_FIRST} ${TRAINER_LAST}`);
    await page.getByTestId("invite-password-input").fill(TRAINER_PASSWORD);
    await page
      .getByTestId("invite-confirm-password-input")
      .fill(TRAINER_PASSWORD);
    await page.getByTestId("invite-submit-button").click();

    // ── 5. Redemption signs them in; the consent gate is the first thing a
    //       brand-new account meets, and only then the trainer shell ─────────
    // A redeemed trainer has no ConsentRecord rows, so the gate (on for the
    // whole E2E run) routes them to /consent before any tab renders. Accepting
    // is part of the real onboarding, not a detour around it.
    await expect(page.getByTestId("consent-submit-button")).toBeVisible({
      timeout: 20_000,
    });
    for (const key of ["tos", "privacy"] as const) {
      const toggle = page.getByTestId(`document-card-accept-${key}`);
      await expect(toggle).toBeVisible({ timeout: 8_000 });
      await toggle.click();
    }
    await expect(page.getByTestId("consent-submit-button")).toBeEnabled({
      timeout: 5_000,
    });
    await page.getByTestId("consent-submit-button").click();

    // The trainer landing tab — the schedule, not the client home. This is the
    // assertion that would break if complete-invite ever created a CLIENT.
    await expect(page.getByTestId("tab-raspored")).toBeVisible({
      timeout: 20_000,
    });
    expect(page.url()).not.toMatch(/\/sign-in/);

    // ── 6+7. Back on the admin side: the rate is live and the invite closed ──
    await signOut(page);

    await signInAs(page, "admin");
    await openTreneri(page);

    // The payoff: the new trainer is in the roster at the percent agreed at
    // invite time — no admin had to go set a rate after the fact.
    const rosterRow = page
      .locator('[data-testid^="procenti-trainer-"]')
      .filter({ hasText: `${TRAINER_FIRST} ${TRAINER_LAST}` });
    await expect(rosterRow).toHaveCount(1, { timeout: 20_000 });
    await expect(rosterRow).toContainText(`${TRAINER_PERCENT}%`);

    // And the invite that produced them reads as done rather than still pending.
    await expect(inviteRow).toContainText(t.admin.clients.inviteStatusCompleted, {
      timeout: 15_000,
    });
  });
});
