/**
 * E2E: the "Rezerviše za" client banner X (clear) button.
 *
 * Regression for the SDK-56 nested-Pressable bug: the X sits inside the
 * banner's outer Pressable, so without stopPropagation the tap bubbled up,
 * re-opened the client picker, and the clear looked like a no-op.
 *
 * Asserts that tapping X:
 *   1. reverts the banner to the "Izaberi klijenta" placeholder, and
 *   2. does NOT open the client-picker sheet.
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { pressRNW } from "./helpers/interactions";
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

test.describe("admin reservation — clear bound client", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
    if (_prisma) await _prisma.$disconnect();
  });

  test("tapping the banner X clears the client without re-opening the picker", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    const emptyClient = await prisma().user.findUniqueOrThrow({
      where: { email: EMPTY_CLIENT_EMAIL },
      select: { id: true, clientProfile: { select: { id: true, userId: true } } },
    });
    if (!emptyClient.clientProfile) throw new Error("seed missing clientProfile");

    // Land on the reservation screen with the client pre-bound — the banner
    // renders the client name + the X (clear) affordance.
    const qs = new URLSearchParams({
      clientProfileId: emptyClient.clientProfile.id,
      clientUserId: emptyClient.clientProfile.userId,
      clientFullName: "Empty Client",
    });
    await page.goto(`/klijenti/rezervisi?${qs.toString()}`);

    const banner = page.getByTestId("reservation-client-banner");
    await banner.waitFor({ state: "visible", timeout: 15_000 });
    await expect(banner).toContainText("Empty Client");

    // Tap the X. pressRNW drives RN-Web's press responder deterministically
    // (a bare click() only intermittently fires onPress) — exactly the path
    // this fix relies on: the inner press must reach onClear, not bubble up.
    await pressRNW(page.getByTestId("reservation-client-banner-clear"));

    // The banner reverts to the placeholder…
    await expect(banner).toContainText("Izaberi klijenta");
    await expect(banner).not.toContainText("Empty Client");

    // …and the client picker sheet did NOT open (the bug: the bubbled tap
    // re-opened it). Its search input must be absent.
    await expect(
      page.getByTestId("reservation-client-picker-search"),
    ).toHaveCount(0);
  });
});
