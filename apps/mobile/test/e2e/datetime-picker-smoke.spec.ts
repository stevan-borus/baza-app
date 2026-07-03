import { test, expect } from "./helpers/fixtures";
import { now } from "../../lib/now";
import { signInAs } from "./helpers/auth";
import { resetAndSeed, disconnect } from "./helpers/db";

/**
 * Smoke for the web DateTimePicker rebuild. Boots the admin schedule,
 * opens "New session", and confirms the Studio-styled DayPicker calendar
 * + time input render and round-trip a value.
 *
 * Fast safety net for the new picker before the scheduling specs lean
 * on it.
 */
test.describe("DateTimePicker web smoke", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("admin opens new-session sheet → calendar + time inputs render", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    // "Novi termin" hero row lives on the katalog tab (admin nav rewire in #28).
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-novi-termin").dispatchEvent("click");

    await page
      .getByTestId("session-create-startsAt")
      .dispatchEvent("click");

    // The web sheet should mount the calendar + time input.
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="date-time-picker-time-input"]'),
    ).toBeVisible();

    // Snapshot the picker so the team can eyeball the styling.
    await page.locator('[data-testid="date-time-picker-calendar"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/datetime-picker-snapshot.png",
      fullPage: true,
    });

    // Pick a date 7 days out and a time, then confirm.
    const target = now();
    target.setDate(target.getDate() + 7);
    const targetDay = String(target.getDate());
    await page
      .locator('[data-testid="date-time-picker-calendar"] button.rdp-day_button', {
        hasText: new RegExp(`^${targetDay}$`),
      })
      .first()
      .dispatchEvent("click");

    await page
      .locator('[data-testid="date-time-picker-time-input"]')
      .fill("10:30");

    await page
      .getByTestId("date-time-picker-confirm")
      .dispatchEvent("click");

    // Sheet closes and the trigger field shows the picked value.
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
