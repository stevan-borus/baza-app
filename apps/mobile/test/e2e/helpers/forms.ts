import { expect, type Page } from "./fixtures";

/**
 * Opens the admin invite-form DOB picker and selects a valid past day, which
 * is required to enable the "send invite" button (consent gate, #32). Uses the
 * same DayPicker driving pattern as the other date-picker specs: open →
 * wait for the calendar → click a day cell by its text → confirm. Day 15
 * exists in every month, so it's safe regardless of the month shown.
 */
export async function pickInviteDob(page: Page, day = "15"): Promise<void> {
  const calendar = page.locator('[data-testid="date-time-picker-calendar"]');
  // Open the picker unless a caller already opened it (this test asserts the
  // calendar mounts before delegating the day-selection here).
  if (!(await calendar.isVisible())) {
    await page.getByTestId("invite-create-dob-input").dispatchEvent("click");
  }
  await expect(calendar).toBeVisible({ timeout: 10_000 });
  await page
    .locator('[data-testid="date-time-picker-calendar"] button.rdp-day_button', {
      hasText: new RegExp(`^${day}$`),
    })
    .first()
    .dispatchEvent("click");
  await page.getByTestId("date-time-picker-confirm").dispatchEvent("click");
}
