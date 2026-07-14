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
 * booking sheet on its cancel step (the same forfeit-warning sheet as the
 * calendar) — we assert the sheet's cancel affordance appears rather than
 * actually forfeiting a spot, keeping the spec side-effect free.
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

    // The detail header renders the localized title.
    await expect(
      page.getByText("Predstojeći termini", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // At least one seeded upcoming booking row is present.
    await expect(
      page.locator('[data-testid^="booking-row-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("71: tapping an upcoming booking opens the cancel sheet", async ({
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

    // The booking sheet opens on the cancel-confirm step for a booked session.
    // Its confirm CTA carries the cancel copy — assert it becomes visible.
    await expect(
      page.getByText("Otkaži", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
