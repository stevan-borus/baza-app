/**
 * Shared sign-in entryway for E2E specs.
 *
 * Goal: one canonical "get me past /sign-in" flow instead of a per-spec
 * copy. Every spec whose sign-in is just the entryway (not the subject
 * under test) goes through `signInAs`; specs that assert the sign-in /
 * consent-gate flow itself (auth-smoke, auth-extended invite activation,
 * consent-gate*) keep their explicit inline flows and only import
 * `SEED_PASSWORD` from here.
 *
 * Landing testIDs (wired in lib/tab-layout-theme.tsx):
 * - admin   → `tab-pregled`  (Phase 1 admin shell's leftmost/landing tab)
 * - trainer → `tab-raspored` (schedule — the trainer landing tab, not "index")
 * - client  → `tab-index`    (client home)
 *
 * Some specs historically waited on a different tab of the same landing
 * shell (e.g. `tab-klijenti` before clicking it) — pass `{ landing }` to
 * preserve that. `{ timeout }` covers the few specs that waited 20s.
 */
import { expect, type Page } from "@playwright/test";

/** Password shared by every rich-seed account. */
export const SEED_PASSWORD = "Password123!";

/** The rich seed's single admin account. */
export const ADMIN_EMAIL = "admin.e2e@example.test";

/** The rich seed's Reformer trainer — the default "trainer" identity. */
export const TRAINER_EMAIL = "trainer.reformer@e2e.test";

/**
 * Who to sign in as: the "admin" / "trainer" shorthands resolve to the
 * seed accounts above; any other string is treated as a literal seed
 * email (e.g. a client-matrix email like "client.active.reformer@e2e.test",
 * or "trainer.energy@e2e.test" — trainer emails land on `tab-raspored`).
 */
type SignInWho = "admin" | "trainer" | (string & {});

function resolveWho(who: SignInWho): { email: string; landing: string } {
  if (who === "admin") return { email: ADMIN_EMAIL, landing: "tab-pregled" };
  if (who === "trainer") return { email: TRAINER_EMAIL, landing: "tab-raspored" };
  return {
    email: who,
    landing: who.startsWith("trainer.") ? "tab-raspored" : "tab-index",
  };
}

/**
 * Sign in via the /sign-in form with seed credentials and wait for the
 * role's landing testID to be visible.
 */
export async function signInAs(
  page: Page,
  who: SignInWho,
  opts: { landing?: string; timeout?: number } = {},
): Promise<void> {
  const { email, landing } = resolveWho(who);
  await page.goto("/sign-in");
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId(opts.landing ?? landing)).toBeVisible({
    timeout: opts.timeout ?? 15_000,
  });
}
