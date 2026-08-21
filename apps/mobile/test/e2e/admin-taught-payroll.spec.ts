/**
 * An admin who teaches is the studio owner covering a class, not staff owed a
 * cut of it. So payroll does not zero them out and does not render them as an
 * empty row — it has no month for them at all, and no roster seat either.
 *
 * The claims only e2e can settle, because "absent" is enforced in two places
 * that never see each other and are each individually plausible to break:
 *
 *   1. The Procenti roster hides the admin CLIENT-SIDE. `/api/users/trainers`
 *      deliberately returns ADMIN alongside TRAINER — session assignment needs
 *      admins in the picker — so the only thing keeping the owner off the pay
 *      roster is a `.filter(role === "TRAINER")` in the screen. Nothing on the
 *      server would stop that row appearing if the filter were dropped while
 *      "cleaning up redundant filtering", and every unit-level test of the
 *      endpoint would still pass. Only a real render can catch it.
 *   2. `GET /api/payroll/month?trainerUserId=<adminId>` 404s. Asserted through
 *      the signed-in admin's own browser session, because the route's earlier
 *      ownership branch means the answer depends on who is asking — a mocked
 *      request proves nothing about the path the app actually takes.
 *
 * The third test seeds a session the admin genuinely taught, with a real client
 * booking behind it. That is the case that regresses if someone "repairs" the
 * 404 by falling back to any user who has sessions: the row would exist, the
 * lookup would succeed, and the owner would start drawing a commission from
 * their own studio's revenue.
 */
import { test, expect } from "./helpers/fixtures";
import { signInAs, ADMIN_EMAIL, TRAINER_EMAIL } from "./helpers/auth";
import {
  createPastSessionWithBooking,
  disconnect,
  getUserIdByEmail,
  resetAndSeed,
} from "./helpers/db";
import { now } from "../../lib/now";
import { t } from "./helpers/locales";

/**
 * The seed's only client holding a Reformer package — the helper refuses to
 * book a session whose class type no package of the client's covers.
 */
const CLIENT_EMAIL = "client.active.reformer@e2e.test";
const CLASS_TYPE = "Reformer pilates";

let adminUserId: string;
let trainerUserId: string;

test.describe.serial("admin-taught sessions are invisible to payroll", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();

    adminUserId = await getUserIdByEmail(ADMIN_EMAIL);
    trainerUserId = await getUserIdByEmail(TRAINER_EMAIL);

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

  test("the admin is absent from the Procenti roster even though /api/users/trainers returns them", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAs(page, "admin");

    // The payload the screen filters. Asserting it CONTAINS the admin is what
    // makes the absence below meaningful: the row is missing because the
    // screen dropped it, not because the data never had it.
    const trainersRes = await page.request.get("/api/users/trainers");
    expect(trainersRes.status()).toBe(200);
    const trainersBody = (await trainersRes.json()) as {
      users: { id: string; role: string }[];
    };
    expect(trainersBody.users.map((u) => u.id)).toContain(adminUserId);

    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-row-treneri").dispatchEvent("click");
    await page.waitForURL(/\/katalog\/treneri$/, { timeout: 10_000 });

    // A real trainer's row first: it proves the list rendered, so the admin's
    // absence is a filtered row rather than a screen that never painted.
    await expect(
      page.getByTestId(`procenti-trainer-${trainerUserId}`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId(`procenti-trainer-${adminUserId}`),
    ).toHaveCount(0);

    // The heading counts what the roster is willing to pay, so it has to agree
    // with the rows rather than with the payload — derived from the rows on
    // screen so this doesn't re-freeze the seed's trainer count.
    const rowCount = await page
      .locator('[data-testid^="procenti-trainer-"]')
      .count();
    expect(rowCount).toBeLessThan(trainersBody.users.length);
    await expect(
      page.getByText(`${t.payroll.ratesTitle} · ${rowCount}`),
    ).toBeVisible();
  });

  test("the month endpoint 404s for an admin id", async ({ page }) => {
    await signInAs(page, "admin");

    const anchor = now();
    // 404, not 500: `fail()` returns a Response rather than throwing, so the
    // request never reaches `Sentry.setupExpressErrorHandler`, whose default
    // filter only captures `status >= 500`. Asking payroll about an admin is a
    // normal question with a boring answer, not an incident.
    const res = await page.request.get("/api/payroll/month", {
      params: {
        year: anchor.getFullYear(),
        month: anchor.getMonth() + 1,
        trainerUserId: adminUserId,
      },
    });
    expect(res.status()).toBe(404);

    // Nothing resembling a payout came back — an empty or zeroed month would
    // still be a month, and the admin would show up on a payout surface as
    // somebody who merely earned nothing this period.
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.month).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("payout");

    // The same call for a real trainer succeeds, so the 404 above is about who
    // was asked after, not a broken route or a rejected year/month.
    const trainerRes = await page.request.get("/api/payroll/month", {
      params: {
        year: anchor.getFullYear(),
        month: anchor.getMonth() + 1,
        trainerUserId,
      },
    });
    expect(trainerRes.status()).toBe(200);
  });

  test("a session the admin actually taught still creates no payout month", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const anchor = now();
    // Two days back inside the anchor's own month, so the session is finished
    // and lands in the month the endpoint is asked about.
    const taughtAt = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() - 2,
      9,
      0,
      0,
      0,
    );
    await createPastSessionWithBooking({
      trainerEmail: ADMIN_EMAIL,
      classTypeName: CLASS_TYPE,
      clientEmail: CLIENT_EMAIL,
      startsAt: taughtAt,
    });

    await signInAs(page, "admin");
    const res = await page.request.get("/api/payroll/month", {
      params: {
        year: taughtAt.getFullYear(),
        month: taughtAt.getMonth() + 1,
        trainerUserId: adminUserId,
      },
    });
    expect(res.status()).toBe(404);

    // And teaching didn't buy them a roster seat either — the two seams agree,
    // which is what "invisible to payroll" has to mean.
    await page.goto("/katalog/treneri");
    await expect(
      page.getByTestId(`procenti-trainer-${trainerUserId}`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId(`procenti-trainer-${adminUserId}`),
    ).toHaveCount(0);
  });
});
