import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";

/**
 * Client "Upcoming sessions" screen (profile → Predstojeći termini).
 *
 * Surfaces all future booked sessions grouped by day so the client can
 * cancel without hunting the calendar. Left unrun in CI (e2e is a local /
 * merge-pass gate); this file exists so the merge pass picks it up.
 *
 * The reformer client has seeded upcoming Reformer bookings, so the list is
 * non-empty and at least one BookingRow renders. Tapping a row opens the
 * booking sheet on its overview (the same sheet as the calendar) — a single
 * "Otkaži" button that only reveals the Potvrdi / Nazad confirmation once
 * tapped. We drive that two-step flow up to (but not through) the final
 * Potvrdi, keeping the spec side-effect free.
 */
test.describe("client upcoming sessions", () => {
  test("70: client opens upcoming sessions from profile and sees a booking", async ({
    page,
  }) => {
    await signInAs(page, "client.active.reformer@e2e.test");

    // Reach the profile tab, then push the upcoming sub-route via its row.
    await page.goto("/profile");
    await page
      .getByTestId("client-profile-upcoming-row")
      .dispatchEvent("click");

    // The detail header shows the BAZA logo lockup, not the title text
    // (AppHeader keeps `title` for API compatibility but renders the logo),
    // so the screen-loaded signal is the seeded upcoming booking row itself:
    // at least one must be present.
    await expect(
      page.locator('[data-testid^="booking-row-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("71: tapping an upcoming booking opens the overview, then confirm", async ({
    page,
  }) => {
    await signInAs(page, "client.active.reformer@e2e.test");

    await page.goto("/profile");
    await page
      .getByTestId("client-profile-upcoming-row")
      .dispatchEvent("click");

    const firstRow = page.locator('[data-testid^="booking-row-"]').first();
    await firstRow.waitFor({ state: "visible", timeout: 10_000 });
    await firstRow.dispatchEvent("click");

    // The sheet opens on its OVERVIEW — a single "Otkaži" button — NOT straight
    // on the two-button confirmation. The Potvrdi confirm CTA must be absent
    // until the client taps Otkaži, matching the calendar's cancel flow.
    const cancelButton = page.getByTestId("booking-cancel-button");
    await expect(cancelButton).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId("booking-confirm-cancel-button"),
    ).toHaveCount(0);

    // Tapping Otkaži reveals the Potvrdi / Nazad confirmation.
    await cancelButton.dispatchEvent("click");
    await expect(
      page.getByTestId("booking-confirm-cancel-button"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
