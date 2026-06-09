import { expect, type Page } from "./fixtures";

/**
 * Opens a DOB DateTimePicker (identified by its trigger testID) and selects a
 * valid past day. Shared DayPicker driving pattern: open → wait for the
 * calendar → click a day cell by its text → confirm. Day 15 exists in every
 * month, so it's safe regardless of the month shown.
 */
export async function pickDob(
  page: Page,
  triggerTestId: string,
  day = "15",
): Promise<void> {
  const calendar = page.locator('[data-testid="date-time-picker-calendar"]');
  // Open the picker unless a caller already opened it.
  if (!(await calendar.isVisible())) {
    await page.getByTestId(triggerTestId).dispatchEvent("click");
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

/**
 * Drives the admin invite-form DOB picker (required to enable "send invite",
 * consent gate #32). Thin wrapper over pickDob for the invite trigger.
 */
export async function pickInviteDob(page: Page, day = "15"): Promise<void> {
  return pickDob(page, "invite-create-dob-input", day);
}
