/**
 * Clearing the consent gate as an adult client.
 *
 * Any spec whose subject is *past* the gate (invite redemption, profile,
 * bookings) still has to walk through it, because a CLIENT with no consent
 * records is redirected to /consent before any tab renders. This is that walk,
 * in one place.
 *
 * The gate asks for three documents (eula is staff-only — see
 * GATE_DOCUMENT_KEYS_FOR_ROLE in lib/legal/versions.ts) plus two Da/Ne
 * questions. Answering marketing here also means the one-time campaigns
 * opt-in sheet will not appear afterwards.
 */
import { expect, type Page } from "@playwright/test";

const GATE_DOCUMENT_KEYS = ["tos", "privacy", "waiver_adult"] as const;

export async function completeClientConsent(page: Page): Promise<void> {
  for (const key of GATE_DOCUMENT_KEYS) {
    const toggle = page.getByTestId(`document-card-accept-${key}`);
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await toggle.click();
  }

  // Both Da/Ne questions block Continue on their own; either answer unblocks.
  await page.getByTestId("social-media-yes").click();
  await page.getByTestId("marketing-consent-yes").click();

  const submit = page.getByTestId("consent-submit-button");
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await submit.click();
}
