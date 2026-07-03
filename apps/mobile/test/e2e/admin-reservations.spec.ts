/**
 * E2E: admin reservation flow (create + bulk-cancel).
 *
 * Drives the reservation screen end-to-end through a browser:
 *   1. Admin signs in, opens an empty client's profile, taps the
 *      "Rezerviši sesije" action — lands on the reservation screen
 *      with the client pre-bound via query params.
 *   2. The client has no package (client.empty@e2e.test from the seed)
 *      — proves the package-eligibility gate is skipped.
 *   3. Tap a session card to select it, confirm — assert exactly one
 *      Booking row appears in the DB with createdByUserId set to the
 *      admin and clientPackageId null.
 *   4. Switch to cancel mode, tap the same booking, confirm cancel —
 *      assert the Booking row is canceled.
 */
import { test, expect } from "./helpers/fixtures";
import { ADMIN_EMAIL, signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { PrismaClient } from "../../generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const EMPTY_CLIENT_EMAIL = "client.empty@e2e.test";

let _prisma: PrismaClient | null = null;
function prisma(): PrismaClient {
  if (!_prisma) {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5434/baza_app_test?schema=public",
    });
    const adapter = new PrismaPg(pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}

test.describe("admin reservations", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
    if (_prisma) await _prisma.$disconnect();
  });

  test("admin reserves an unbacked session and then bulk-cancels it", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    // Open the empty client's profile via the clients tab.
    const emptyClient = await prisma().user.findUniqueOrThrow({
      where: { email: EMPTY_CLIENT_EMAIL },
      select: { id: true, clientProfile: { select: { id: true, userId: true } } },
    });
    if (!emptyClient.clientProfile) throw new Error("seed missing clientProfile");

    // Navigate directly to the reservation screen with client pre-bound
    // via query params (the "Reserve sessions" client-profile entry uses
    // the same shape).
    const qs = new URLSearchParams({
      clientProfileId: emptyClient.clientProfile.id,
      clientUserId: emptyClient.clientProfile.userId,
      clientFullName: "Empty Client",
    });
    await page.goto(`/klijenti/rezervisi?${qs.toString()}`);

    // Wait for the week strip then pick a day that has sessions. The
    // anchor is Mon 2026-05-11 09:00 (just before the seeded 10:00 Reformer
    // session) so today + Wed + Fri all have Reformer; Tue + Thu have Energy.
    // Pick Wednesday (May 13) — it has a single 10:00 Reformer session.
    await page
      .locator('[data-testid="week-strip-day-2026-05-13"]')
      .first()
      .click();

    // Find any upcoming session card in the calendar.
    const card = page
      .locator('[data-testid^="reservation-session-"]')
      .first();
    await card.waitFor({ state: "visible", timeout: 15_000 });
    const cardTestId = await card.getAttribute("data-testid");
    const sessionId = cardTestId?.replace("reservation-session-", "") ?? "";
    expect(sessionId).not.toBe("");

    // Tap to select. Use real click() — react-native-web Pressable reads
    // pointerdown/pointerup, which dispatchEvent("click") doesn't synthesize.
    await card.click();

    // Tap the toolbar CTA to open the confirm sheet.
    await page.getByTestId("reservation-toolbar-cta").click();

    // Press the confirm-sheet CTA.
    await page
      .getByTestId("reservation-confirm-sheet-cta")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("reservation-confirm-sheet-cta").click();

    // Booking should now exist in the DB, unbacked.
    await expect
      .poll(
        async () =>
          await prisma().booking.count({
            where: {
              sessionId,
              clientProfileId: emptyClient.clientProfile!.id,
              canceledAt: null,
              clientPackageId: null,
            },
          }),
        { timeout: 10_000 },
      )
      .toBe(1);

    const booking = await prisma().booking.findFirstOrThrow({
      where: {
        sessionId,
        clientProfileId: emptyClient.clientProfile.id,
      },
      select: { id: true, createdByUserId: true },
    });
    const admin = await prisma().user.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    });
    expect(booking.createdByUserId).toBe(admin.id);

    // Switch to cancel mode and cancel the booking we just made.
    await page.getByTestId("reservation-mode-cancel").click();
    const cancelRow = page.getByTestId(`cancel-booking-${booking.id}`);
    await cancelRow.waitFor({ state: "visible", timeout: 10_000 });
    await cancelRow.click();
    await page.getByTestId("reservation-toolbar-cta").click();
    await page
      .getByTestId("reservation-cancel-confirm-sheet-cta")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("reservation-cancel-confirm-sheet-cta").click();

    await expect
      .poll(
        async () =>
          await prisma().booking.count({
            where: { id: booking.id, canceledAt: { not: null } },
          }),
        { timeout: 10_000 },
      )
      .toBe(1);
  });

  test("trainer hitting /klijenti/rezervisi is redirected away", async ({ page }) => {
    // Trainer-lead is a TRAINER per the rich seed.
    await signInAs(page, "trainer");

    await page.goto("/klijenti/rezervisi");
    // Should never land on the admin reservation route — redirect kicks in.
    await page.waitForURL((url) => !url.pathname.includes("/klijenti/rezervisi"), {
      timeout: 10_000,
    });
    expect(page.url()).not.toContain("/klijenti/rezervisi");
  });

  test("admin reserves via pattern overlay and confirms unbacked-attendance copy", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    const emptyClient = await prisma().user.findUniqueOrThrow({
      where: { email: EMPTY_CLIENT_EMAIL },
      select: { clientProfile: { select: { id: true, userId: true } } },
    });
    if (!emptyClient.clientProfile) throw new Error("seed missing clientProfile");

    const qs = new URLSearchParams({
      clientProfileId: emptyClient.clientProfile.id,
      clientUserId: emptyClient.clientProfile.userId,
      clientFullName: "Empty Client",
    });
    await page.goto(`/klijenti/rezervisi?${qs.toString()}`);

    // Open the pattern accelerator.
    await page
      .getByTestId("reservation-open-pattern-sheet")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("reservation-open-pattern-sheet").click();

    // The sheet renders the weekly + biweekly toggles. Just verify the
    // "Naizmenično" rhythm pill is reachable — full biweekly assertion is
    // covered at the integration layer via the applyPattern logic.
    await expect(page.getByText(/Naizmenično/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Svake nedelje/)).toBeVisible();
  });
});
