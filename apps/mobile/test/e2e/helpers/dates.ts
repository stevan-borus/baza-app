/**
 * Date helpers for E2E specs.
 *
 * Goal: every spec that touches dates uses the same deterministic logic
 * so we don't end up with subtly different "next Reformer day" loops
 * scattered across files. The `i === 0` guard skips today only when the
 * spec is starting at "now" and the seeded 10:00 session has already
 * passed — replacing the racy `d.getTime() === Date.now()` pattern that
 * lived in older specs.
 *
 * Note: these helpers still depend on the wall clock. The full anchor-
 * time refactor (freezing browser AND server `Date` to a fixed instant)
 * is unimplemented — see CONTEXT.md → "Anchor time".
 */
import type { Page } from "@playwright/test";

const REFORMER_WEEKDAYS = new Set([1, 3, 5]);

export function dateKeyFromDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pick the next Reformer weekday on or after today's date. If today is a
 * Reformer day AND the seeded 10:00 session has already passed, advance
 * to the next Reformer day. Bounded at 14 days.
 */
export function nextReformerDayKey(): string {
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    if (REFORMER_WEEKDAYS.has(d.getDay()) && !(i === 0 && d.getHours() >= 10)) {
      return dateKeyFromDate(d);
    }
    d.setDate(d.getDate() + 1);
  }
  throw new Error("No Reformer day in next 14 days");
}

/**
 * Click prev/next chevrons on the StudioWeekStrip until the target date
 * pill is visible, then click it. The schedule's WeekStrip only renders
 * 7 days around `weekStart`; specs that pick a session date from the DB
 * may need to page the strip to find it. Bounded at 6 chevron clicks to
 * avoid runaway loops on a totally wrong date.
 */
export async function navigateWeekStripTo(page: Page, dateKey: string) {
  // Wait for the week strip to render at all so subsequent count() checks
  // aren't false negatives caused by an unmounted screen.
  await page
    .locator('[data-testid^="week-strip-day-"]:visible')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });

  const dayLocator = page.locator(
    `[data-testid="week-strip-day-${dateKey}"]:visible`,
  );

  if ((await dayLocator.count()) === 0) {
    const target = new Date(`${dateKey}T00:00:00`);
    const chevron =
      target > new Date() ? "week-strip-next" : "week-strip-prev";
    for (let i = 0; i < 6; i++) {
      await page.getByTestId(chevron).first().dispatchEvent("click");
      try {
        // Block until the new week renders OR until ~1.5s passes (then
        // try the next chevron). This is condition-based, not time-based.
        await dayLocator.first().waitFor({ state: "visible", timeout: 1500 });
        break;
      } catch {
        // Day still not visible after this chevron click — try again.
      }
    }
  }
  await dayLocator.first().dispatchEvent("click");
}
