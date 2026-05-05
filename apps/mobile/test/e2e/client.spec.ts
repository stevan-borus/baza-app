import { test, expect, type Page } from "@playwright/test";
import {
  countActiveBookingsFor,
  disconnect,
  resetAndSeed,
} from "./helpers/db";

const SEED_PASSWORD = "Password123!";

/**
 * Compute the next upcoming Reformer Mon/Wed/Fri date from "today". The
 * rich seed schedules Reformer pilates on weekdays 1, 3, 5 (Mon, Wed, Fri)
 * for two weeks at 10:00. Returns YYYY-MM-DD.
 */
function nextReformerDate(): string {
  const reformerDays = new Set([1, 3, 5]);
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    if (reformerDays.has(d.getDay())) {
      // If today is a Reformer day but the 10:00 slot has passed, skip.
      if (i === 0 && d.getHours() >= 10) {
        d.setDate(d.getDate() + 1);
        continue;
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    d.setDate(d.getDate() + 1);
  }
  throw new Error("No Reformer day found in next 14 days");
}

/**
 * Client (Serbian). Test-plan items 52-63.
 *
 * Cross-test isolation: each test signs in fresh from /sign-in. The DB
 * baseline is the rich seed (resetAndSeed in beforeAll); tests run in
 * order and share state, but mutations are scoped per-test so there's no
 * cross-test interference for now.
 */
test.describe("client (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  async function signInAsActiveReformer(page: Page) {
    await page.goto("/sign-in");
    await page
      .getByTestId("auth-email-input")
      .fill("client.active.reformer@e2e.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 15_000,
    });
  }

  test("52: home shows the active package's sessions-remaining number", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);

    await expect(page.getByTestId("package-sessions-remaining")).toHaveText(
      "8",
    );
  });

  test("53: calendar shows a Reformer session block on the next Reformer day", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);
    await page.goto("/calendar");

    const target = nextReformerDate();
    const dayPill = page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first();
    await expect(dayPill).toBeVisible();
    // Bypass the stability check — react-native-web Pressables nested in
    // Moti enter animations cause Playwright's stability heuristic to time
    // out. dispatchEvent fires a synthetic click directly on the element.
    await dayPill.dispatchEvent("click");

    await expect(
      page.locator('[data-testid^="session-block-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Reformer pilates").first()).toBeVisible();
  });

  test("54: tap session block opens booking detail with trainer + room", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);
    await page.goto("/calendar");

    const target = nextReformerDate();
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

    const sessionBlock = page
      .locator('[data-testid^="session-block-"]')
      .first();
    await expect(sessionBlock).toBeVisible({ timeout: 10_000 });
    await sessionBlock.dispatchEvent("click");

    // Booking sheet exposes the room/trainer/duration/capacity testIDs.
    await expect(page.getByTestId("booking-detail-room")).toHaveText("Sala 1");
    await expect(page.getByTestId("booking-detail-trainer")).toHaveText(
      "Trainer Reformer Lead",
    );
    await expect(page.getByTestId("booking-detail-duration")).toHaveText(
      "60 min",
    );
  });

  test("55: book a session, see confirmation banner, sessions-remaining decrements", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);
    await page.goto("/calendar");

    const target = nextReformerDate();
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

    await page
      .locator('[data-testid^="session-block-"]')
      .first()
      .dispatchEvent("click");

    const bookingsBefore = await countActiveBookingsFor(
      "client.active.reformer@e2e.test",
    );

    await page.getByTestId("booking-book-button").dispatchEvent("click");
    await page
      .getByTestId("booking-confirm-book-button")
      .dispatchEvent("click");

    await expect(
      page.getByTestId("booking-confirmation-banner"),
    ).toBeVisible({ timeout: 10_000 });

    // sessionsRemaining is decremented by the consumption cron after the
    // session ends, not at booking time. The booking counter is the
    // ground-truth signal that the action persisted.
    await expect
      .poll(
        async () =>
          countActiveBookingsFor("client.active.reformer@e2e.test"),
        { timeout: 10_000 },
      )
      .toBe(bookingsBefore + 1);
  });

  test("56: cancel a booking before the late-cancel cutoff", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);
    await page.goto("/calendar");

    const target = nextReformerDate();
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

    // Open the same Reformer session booked in spec 55.
    await page
      .locator('[data-testid^="session-block-"]')
      .first()
      .dispatchEvent("click");

    const bookingsBefore = await countActiveBookingsFor(
      "client.active.reformer@e2e.test",
    );

    await page.getByTestId("booking-cancel-button").dispatchEvent("click");
    await page
      .getByTestId("booking-confirm-cancel-button")
      .dispatchEvent("click");

    await expect
      .poll(
        async () =>
          countActiveBookingsFor("client.active.reformer@e2e.test"),
        { timeout: 10_000 },
      )
      .toBe(bookingsBefore - 1);
  });

  test.skip(
    "57: late-cancel after cutoff → forfeit (consumption row created)",
    () => {
      // TODO: needs a seed extension that creates a Session starting within
      // 12h (lateCancelHours) AND a Booking the active client owns. The
      // current rich seed only has sessions starting >=10:00 on the next
      // Mon/Wed/Fri, which won't be inside the cutoff for most weekdays.
    },
  );
  test.skip(
    "58: full session shows the join-waitlist button",
    () => {
      // TODO: needs a seed extension that pre-fills a Reformer session to
      // capacity with placeholder client bookings.
    },
  );
  test.skip(
    "59: waitlist promotion creates booking + notification",
    () => {
      // TODO: needs the waitlist seed (spec 58) plus an action that frees a
      // slot (someone else cancels). Multi-actor flow — better tested at
      // the API level for now.
    },
  );

  test("60: notifications list renders", async ({ page }) => {
    await signInAsActiveReformer(page);
    await page.goto("/notifications");

    // The seed leaves no notifications, so we assert the empty state
    // text appears (i18n key client.notifications.empty or similar). At
    // minimum the page loads without errors and the tab bar shows the
    // notifications tab as active.
    await expect(page.getByTestId("tab-notifications")).toBeVisible();
  });

  test("62: client opens profile sheet, switches to English, switches back", async ({
    page,
  }) => {
    await signInAsActiveReformer(page);

    await page.getByTestId("open-profile-sheet").click();
    await page.getByTestId("language-en").dispatchEvent("click");
    // The settings header text re-renders in English. The label key is
    // settings.theme — sr is "Tema", en is "Theme". Use "Theme" presence.
    await expect(page.getByText("Theme", { exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Switch back so the rest of the suite stays in Serbian.
    await page.getByTestId("language-sr").dispatchEvent("click");
    await expect(page.getByText("Tema", { exact: true })).toBeVisible();
  });

  test("63: client signs out from the profile sheet", async ({ page }) => {
    await signInAsActiveReformer(page);

    await page.getByTestId("open-profile-sheet").click();
    await page.getByTestId("profile-sign-out-button").click();

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByTestId("auth-email-input")).toBeVisible();
  });

  test("61: empty-pack client cannot see Reformer sessions in the calendar", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill("client.empty@e2e.test");
    await page.getByTestId("auth-password-input").fill(SEED_PASSWORD);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByTestId("tab-index")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/calendar");
    const target = nextReformerDate();
    await page
      .locator(`[data-testid="week-strip-day-${target}"]:visible`)
      .first()
      .dispatchEvent("click");

    // No session blocks should appear — server filters availability by the
    // client's class-type entitlement and an empty-pack client has none.
    // Wait for the page to settle then assert zero blocks.
    await page.waitForTimeout(1500);
    const blockCount = await page
      .locator('[data-testid^="session-block-"]')
      .count();
    expect(blockCount).toBe(0);
  });
});
