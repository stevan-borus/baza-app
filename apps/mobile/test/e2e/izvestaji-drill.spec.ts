/**
 * E2E: Izveštaji → Prihod → Naplata cross-tab drill (ADR-0005).
 *
 * The Prihod sub-page lets an admin tap a revenue bucket (chart bar) to drill
 * into Naplata, carrying a `returnTo` query so Naplata renders the
 * "← Back to Reports" pill on arrival. Tapping the pill `router.replace`s back
 * to Prihod.
 *
 * This contract was previously covered only by unit tests for the return-to
 * helper; this spec asserts it end-to-end on the real admin surface.
 *
 * The two drill origins carry DIFFERENT payloads, and the difference is the
 * point of the last two tests. A chart bar sends a `from`/`to` window and
 * Naplata pre-filters to that bucket; a recent-payment row sends no window
 * and Naplata falls back to its own month chooser. Asserting only the first
 * would pass even if the pre-filter were dead code — the month fallback also
 * renders rows — so the fallback case is tested alongside it as the contrast
 * that makes the pre-filter claim non-vacuous.
 *
 * Naplata prints the active window in its period label (a range for a drill,
 * "Maj 2026" for the month default), which is what both tests read. The
 * expected range repeats the funded bucket's single Serbian day, formatted
 * independently from the URL's start date and checked against the tapped
 * bar's label.
 */
import dayjs from "dayjs";
// The month label is dayjs-formatted in Serbian; register the locale here
// rather than leaning on `lib/i18n` having imported it as a side effect.
import "dayjs/locale/sr";

import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { pressRNW } from "./helpers/interactions";
import { t } from "./helpers/locales";
import { now } from "../../lib/now";

function expectedMonthLabel(instant: string | Date): string {
  return dayjs(instant).locale("sr").format("MMMM YYYY");
}

test.describe.serial("izveštaji → naplata drill (admin)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("tapping a recent payment row drills to Naplata and the return pill comes back", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/izvestaji/prihod");

    // The recent-payments list renders one full-width Pressable per payment
    // (testID `prihod-recent-<id>`). The seed funds billing records, so at
    // least one row exists, and a full-width row is a stable click target
    // (unlike the 4px-tall zero-revenue chart bars). Tapping it drills into
    // Naplata carrying the `returnTo` param.
    const recentRow = page.locator('[data-testid^="prihod-recent-"]').first();
    await expect(recentRow).toBeVisible();
    await recentRow.click();

    // Drill lands on Naplata.
    await page.waitForURL(/\/naplata/, { timeout: 10_000 });

    // The return pill renders because we arrived via a `returnTo` param.
    const pill = page.getByTestId("naplata-return-to-pill");
    await expect(pill).toBeVisible();

    // Tapping the pill returns to the Izveštaji → Prihod sub-page.
    await pill.click();
    await page.waitForURL(/\/izvestaji\/prihod/, { timeout: 10_000 });
    await expect(
      page.getByText(t.admin.izvestaji.prihod.headline).first(),
    ).toBeVisible();
  });

  test("drilled Naplata list is pre-filtered to the tapped bucket's date range", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/izvestaji/prihod");

    // Tap a FUNDED bucket bar so the drilled window actually contains billing
    // rows and we can assert the list rendered under the filter, not just the
    // header. Zero-revenue bars label themselves "0 RSD <day> <month>", so the
    // attribute selector below excludes them. (The previous parked version
    // chained `.filter({ hasNotText: "" })`, which matches NOTHING — every
    // element contains the empty string — so it could never have selected a
    // bar at all.) A funded bucket is guaranteed: the seed writes CONFIRMED
    // billing records at anchor-5d and anchor-2d, both inside the default
    // "Mesec" window this page opens on.
    const fundedBar = page
      .locator('[data-testid^="prihod-bar-"]:not([aria-label^="0 RSD"])')
      .first();
    await expect(fundedBar).toBeVisible();
    const fundedBarLabel = await fundedBar.getAttribute("aria-label");
    // `pressRNW`, not `click()`: the bar reports visible/enabled/stable, but a
    // full-bleed ancestor sits over the chart and intercepts pointer events, so
    // a real click never lands (verified: 110 retries, then timeout). The
    // recent-row drill above is a full-width target that nothing overlaps,
    // which is why a plain click still works there.
    await pressRNW(fundedBar);

    await page.waitForURL(/\/naplata/, { timeout: 10_000 });

    // Read the window off the URL the app actually navigated to. Their mere
    // presence is half the contract — it proves the origin sent a window —
    // and it lets the expected label be derived instead of hardcoded.
    const params = new URL(page.url()).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();

    // The default chart uses single-day buckets. Allow the clock change on
    // DST days, but reject a drill that accidentally sends a wider window.
    const spanHours =
      (new Date(to!).getTime() - new Date(from!).getTime()) / 3_600_000;
    expect([23, 24, 25]).toContain(spanHours);
    const day = new Intl.DateTimeFormat("sr-Latn-RS", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Belgrade",
    }).format(new Date(from!));
    expect(fundedBarLabel?.endsWith(` ${day}`)).toBe(true);
    // A studio day ends at 05:00 the next morning. Its range label repeats
    // the start day, rather than formatting the end's calendar date.
    const rangeLabel = `${day} – ${day}`;
    // The bucket is a single day, so the month fallback label can never equal
    // the range label. Assert that outright: if the two ever collided, the
    // "not the month" assertion below would pass vacuously.
    const monthLabel = expectedMonthLabel(from!);
    expect(rangeLabel).not.toBe(monthLabel);

    // Naplata renders the period label inside a CapsLabel, which uppercases
    // via CSS only — the DOM text keeps its original case. Match it exactly
    // (not as a substring): "Maj 2026" and "11. maj – 11. maj" share the
    // substring "maj", so a loose match would not distinguish them.
    await expect(
      page.getByText(rangeLabel, { exact: true }).first(),
    ).toBeVisible();

    // The fallback did NOT win: the month label is nowhere on the screen.
    await expect(page.getByText(monthLabel, { exact: true })).toHaveCount(0);

    // The window is populated, so the filter narrowed the list rather than
    // emptying it.
    await expect(
      page.locator('[data-testid^="billing-row-"]').first(),
    ).toBeVisible();
  });

  test("drilling from a recent payment row leaves Naplata on its month default", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/izvestaji/prihod");

    // The recent-row origin calls `drillHref` WITHOUT a window, so Naplata has
    // nothing to pre-filter to and falls back to its own selected month. This
    // is the contrast case: without it, the range assertion above would hold
    // even if Naplata ignored the params and every drill showed a range.
    const recentRow = page.locator('[data-testid^="prihod-recent-"]').first();
    await expect(recentRow).toBeVisible();
    await recentRow.click();

    await page.waitForURL(/\/naplata/, { timeout: 10_000 });

    const params = new URL(page.url()).searchParams;
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();

    // Naplata's month chooser starts at the current instant, which the e2e
    // stack pins to the anchor in both the server and the browser clock.
    const monthLabel = expectedMonthLabel(now());
    await expect(
      page.getByText(monthLabel, { exact: true }).first(),
    ).toBeVisible();
  });
});
