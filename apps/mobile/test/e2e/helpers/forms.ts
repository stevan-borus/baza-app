import { expect, type Page } from "./fixtures";
import { pressRNW } from "./interactions";

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
    await pressRNW(page.getByTestId(triggerTestId));
  }
  await expect(calendar).toBeVisible();
  await pressRNW(
    page
      .locator(
        '[data-testid="date-time-picker-calendar"] button.rdp-day_button',
        { hasText: new RegExp(`^${day}$`) },
      )
      .first(),
  );
  await pressRNW(page.getByTestId("date-time-picker-confirm"));

  // Wait for the picker sheet to FULLY dismiss before returning. Confirm only
  // *starts* gorhom's close animation; the picker's backdrop + react-day-picker
  // `rdp-root` keep intercepting pointer events until `animatedIndex` settles to
  // -1. Returning early lets the caller's next click (e.g. the form's submit
  // button, which the stacked picker sheet sits over) race that animation and
  // get swallowed by the lingering backdrop. The calendar (`rdp-root`) is unique
  // to the picker, so its detach proves the picker content unmounted; we also
  // wait for the backdrop count to drop by one (the picker's own backdrop gone),
  // which holds for both the stacked and standalone cases. State, not time —
  // per AGENTS.md anti-flake.
  const backdropSel = '[aria-label="Bottom sheet backdrop"]';
  const backdropsWhileOpen = await page.locator(backdropSel).count();
  await expect(calendar).toBeHidden();
  await expect
    .poll(async () => page.locator(backdropSel).count())
    .toBeLessThan(backdropsWhileOpen);
}

/**
 * Drives the admin invite-form DOB picker (required to enable "send invite",
 * consent gate #32). Thin wrapper over pickDob for the invite trigger.
 */
export async function pickInviteDob(page: Page, day = "15"): Promise<void> {
  return pickDob(page, "invite-create-dob-input", day);
}
