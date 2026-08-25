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
 * Reads the anchor instant via `lib/now.ts` so date math here matches the
 * dev server (also pinned to the same anchor via `TEST_ANCHOR_TIME`).
 * See CONTEXT.md → "Anchor time".
 */
import type { Page } from "@playwright/test";
import { now } from "../../../lib/now";

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
  const d = now();
  for (let i = 0; i < 14; i++) {
    if (REFORMER_WEEKDAYS.has(d.getDay()) && !(i === 0 && d.getHours() >= 10)) {
      return dateKeyFromDate(d);
    }
    d.setDate(d.getDate() + 1);
  }
  throw new Error("No Reformer day in next 14 days");
}

/**
 * Pick the next Reformer weekday strictly AFTER today. Use this when the spec
 * needs a day on which *every* seeded session is still in the future — the
 * seed runs Reformer at 06:30, 07:30 and 10:00, so on a Reformer "today" the
 * early slots are already past and render as disabled cards.
 */
export function nextFutureReformerDayKey(): string {
  const d = now();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (REFORMER_WEEKDAYS.has(d.getDay())) return dateKeyFromDate(d);
    d.setDate(d.getDate() + 1);
  }
  throw new Error("No Reformer day in next 14 days");
}

/**
 * Tap a session card and wait for the edit sheet to appear. The tap-card
 * action navigates to the session detail page; tap the pencil icon to push
 * back to the dashboard with ?editSessionId= which mounts the edit sheet.
 */
export async function openSessionEditSheet(page: Page, cardLocator: import("@playwright/test").Locator) {
  await cardLocator.dispatchEvent("click");
  await page
    .getByTestId("session-detail-edit-button")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .getByTestId("session-detail-edit-button")
    .first()
    .dispatchEvent("click");
  await page
    .getByTestId("session-edit-save-button")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Click prev/next chevrons on a WeekStrip until the target date pill is
 * visible, then click it. The strip only renders 7 days around `weekStart`;
 * specs that pick a session date from the DB may need to page the strip to
 * find it. Bounded at 6 chevron clicks to avoid runaway loops on a totally
 * wrong date.
 *
 * `scope` is the testID of the container to search within. Pass it whenever
 * more than one WeekStrip can be on screen at once — the notes pickers open
 * in a bottom sheet *over* the still-mounted raspored screen, so the global
 * `week-strip-day-*` selector matches two strips (the picker's and the
 * schedule's behind it). Without a scope, `.first()` would page/click the
 * wrong (background) strip and the picker's selected day would never change.
 * Omit it on full-screen surfaces (raspored) where only one strip exists.
 */
export async function navigateWeekStripTo(
  page: Page,
  dateKey: string,
  scope?: string,
) {
  const root = scope ? page.getByTestId(scope) : page;
  // Wait for the week strip to render at all so subsequent count() checks
  // aren't false negatives caused by an unmounted screen.
  await root
    .locator('[data-testid^="week-strip-day-"]:visible')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });

  const dayLocator = root.locator(
    `[data-testid="week-strip-day-${dateKey}"]:visible`,
  );

  if ((await dayLocator.count()) === 0) {
    const target = new Date(`${dateKey}T00:00:00`);
    const chevron = target > now() ? "week-strip-next" : "week-strip-prev";
    for (let i = 0; i < 6; i++) {
      await root.getByTestId(chevron).first().dispatchEvent("click");
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
