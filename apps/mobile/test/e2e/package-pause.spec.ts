/**
 * Package pause, driven through the real admin and client UIs.
 *
 * The server semantics are already nailed down by the 27 cases in
 * test/integration/package-pause.test.ts. What only e2e can settle is that the
 * admin's two-field form actually produces those effects, and that the client
 * on the other end of them sees the consequence:
 *
 *   1. Pausing a client with an upcoming reservation takes the reservation off
 *      the admin's own surfaces — the client-detail Treninzi list AND the seat
 *      count on the schedule block, which is the number the studio plans from.
 *   2. The paused client's own upcoming list loses that booking, and every
 *      session in the window renders paused-locked: the "Pauzirano" row action
 *      and a sheet that explains the pause instead of offering to book. This is
 *      the whole reason the lock has its own reason code — telling a client who
 *      paused on purpose to "renew" would be wrong.
 *   3. A second pause overlapping the first is refused with the specific
 *      overlap copy, not the generic failure. The distinction only exists on
 *      the 409 branch, so a spec that accepted either would not test it.
 *   4. Ending a pause early from client detail clears the "Pauziran" pill, and
 *      the reservation the pause cancelled stays cancelled. Ending is not an
 *      undo, and the confirm sheet says so before anything is written.
 *
 * Dates: every window below is derived from `now()` (the pinned anchor), never
 * from wall clock. The pause form takes plain `YYYY-MM-DD`, which the input
 * schema coerces to UTC midnight — a window opening on the anchor's own date is
 * therefore already running at the anchor instant (09:00Z), which is what makes
 * the client-side PAUSED lock resolve: `classifyRenewalLockReason` is evaluated
 * at `now()`, not at the session's start.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { now } from "../../lib/now";
import { t } from "./helpers/locales";
import {
  bookClientOnSession,
  countActiveBookingsOnSession,
  createFutureSession,
  disconnect,
  findBookingById,
  findPackagePausesFor,
  resetAndSeed,
} from "./helpers/db";
import { dateKeyFromDate, navigateWeekStripTo } from "./helpers/dates";
import { pickDate } from "./helpers/forms";
import { pressRNW } from "./helpers/interactions";

/**
 * The client scenarios 1-2 pause. Chosen because the rich seed leaves them
 * un-paused with a live Reformer pack — the `paused` matrix client is already
 * inside a pause and would 409 the very first write.
 */
const TARGET_CLIENT_EMAIL = "client.active.reformer@e2e.test";
const TARGET_CLIENT_NAME = "Active Reformer Client";

/**
 * The client scenarios 3-4 act on. The rich seed gives them a running pause
 * (anchor-1d → anchor+7d) plus a live comp pack, so both the overlap refusal
 * and the end-pause action have their precondition without this file writing
 * one first.
 */
const PAUSED_CLIENT_EMAIL = "client.paused@e2e.test";
const PAUSED_CLIENT_NAME = "Paused Pack Client";

/**
 * The session the pause must cancel. 48h out so it clears the 4h empty-session
 * cutoff (which is checked BEFORE the per-client lock and would otherwise mask
 * the PAUSED reason with EMPTY_CUTOFF), and comfortably inside a window opened
 * today.
 */
const SESSION_HOURS_FROM_NOW = 48;

/** `YYYY-MM-DD` offset from the anchor, in the same local frame the strip uses. */
function anchorDateKey(dayOffset: number): string {
  const d = now();
  d.setDate(d.getDate() + dayOffset);
  return dateKeyFromDate(d);
}

/**
 * The day-of-month a `YYYY-MM-DD` key falls on, unpadded — the calendar
 * renders day cells as bare numbers ("5", not "05"), and `pickDate` matches
 * that text exactly.
 */
function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}

/**
 * Reach a client's admin detail screen. Searching first is mandatory on this
 * list: rows are id-ordered inside a virtualized list, so a bare name-match is
 * a per-seed lottery over which rows happen to be mounted.
 *
 * The search is token-ANDed across firstName / lastName / EMAIL, so a
 * full-name query can pull in a second client whose email happens to contain
 * one of the tokens. Narrowing to the row that actually carries the name — and
 * waiting for the list to be down to that one row before tapping — is what
 * keeps this from opening the wrong client's detail screen.
 */
async function openClientDetail(page: Page, fullName: string) {
  await page.getByTestId("tab-klijenti").click();
  const search = page.getByTestId("klijenti-search-input");
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(fullName);

  const row = page
    .locator('[data-testid^="client-row-"]')
    .filter({ hasText: fullName });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.dispatchEvent("click");

  // The header card is the screen-loaded signal — AppHeader renders the logo,
  // not the client's name, so the title is not assertable. Assert the NAME on
  // the header too, so opening the wrong client fails here rather than three
  // assertions later.
  //
  // Scope the name to the header card's own node: a bare getByText(fullName)
  // ALSO matches the klijenti row behind the detail screen, which stays
  // mounted but hidden, and `.first()` picks it in DOM order — so the
  // assertion fails "hidden" on a screen that in fact loaded correctly.
  await expect(page.getByTestId("client-detail-email")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("client-detail-name")).toHaveText(fullName, {
    timeout: 15_000,
  });
}

/**
 * Open the pause form from client detail. The pencil action sheet is the
 * power-user path and the only entry point that exists on both the list and
 * the detail screen, so it is the one worth driving.
 */
async function openPauseSheet(page: Page) {
  // The pencil in the header rightSlot — `client-detail-edit-button` opens the
  // five-row action sheet (it does NOT open the edit form; the edit row inside
  // the sheet does).
  await pressRNW(page.getByTestId("client-detail-edit-button").first());
  const pauseRow = page.getByTestId("client-action-pause");
  await pauseRow.waitFor({ state: "visible", timeout: 15_000 });
  await pressRNW(pauseRow);
  await expect(page.getByTestId("pause-submit-button")).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Fill and submit the pause form.
 *
 * Both date fields are DateTimePickers, not text inputs, so the dates are
 * chosen through the shared `pickDate` calendar driver rather than typed. That
 * helper also waits out the picker sheet's dismissal, which matters here: its
 * backdrop sits over this form's submit button and would swallow the press.
 *
 * Days are passed as day-of-month because that is what the calendar exposes.
 * Every window this spec picks lives inside the anchor's own month, so no
 * month navigation is needed; a caller crossing a month boundary would have to
 * page the calendar first. The end picker's `minimumDate` follows the chosen
 * start, and the start's is today, so the days must be ordered and not past.
 *
 * The wait before pressing submit is load-bearing, not defensive: submit is
 * disabled until both fields hold a value, and `pressRNW` deliberately
 * bypasses Playwright's actionability gate — so pressing before React has
 * re-rendered would dispatch into a disabled Pressable and silently do
 * nothing. RN-Web renders `disabled` as `aria-disabled`, never the DOM
 * attribute, so `toBeDisabled()` would misreport here; the attribute is read
 * directly.
 */
async function submitPause(page: Page, startsAt: string, endsAt: string) {
  await pickDate(page, "pause-start-input", dayOfMonth(startsAt));
  await pickDate(page, "pause-end-input", dayOfMonth(endsAt));
  const submit = page.getByTestId("pause-submit-button");
  await expect(submit).not.toHaveAttribute("aria-disabled", "true", {
    timeout: 15_000,
  });
  await pressRNW(submit);
}

test.describe.serial("package pause — admin form and client consequence", () => {
  /** The seeded upcoming reservation the first pause must cancel. */
  let bookingId: string;
  let sessionId: string;
  let sessionDateKey: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();

    // Plant the reservation the pause is supposed to take away. Created
    // directly rather than through the booking UI because the booking is the
    // precondition here, not the subject — and doing it in the DB keeps the
    // session id, which every later assertion hangs off.
    const session = await createFutureSession({
      trainerEmail: "trainer.reformer@e2e.test",
      classTypeName: "Reformer pilates",
      hoursFromNow: SESSION_HOURS_FROM_NOW,
    });
    sessionId = session.id;
    sessionDateKey = dateKeyFromDate(session.startsAt);
    const booked = await bookClientOnSession(TARGET_CLIENT_EMAIL, sessionId);
    bookingId = booked.bookingId;

    // Warm the Expo web bundle once — the first navigation triggers a lazy
    // Metro compile that can outlast a single test's 60s budget.
    const warm = await browser.newPage();
    try {
      await warm.goto("/sign-in", {
        timeout: 180_000,
        waitUntil: "domcontentloaded",
      });
      await warm
        .getByTestId("auth-email-input")
        .waitFor({ state: "visible", timeout: 180_000 });
    } finally {
      await warm.close();
    }
  });

  test.afterAll(async () => {
    await disconnect();
  });

  test("1: pausing a client cancels their upcoming reservation and frees the seat", async ({
    page,
  }) => {
    // Precondition, stated rather than assumed: the seat is taken going in, so
    // the freed-seat assertion below is a change and not a coincidence.
    expect(await countActiveBookingsOnSession(sessionId)).toBe(1);

    await signInAs(page, "admin");
    await openClientDetail(page, TARGET_CLIENT_NAME);

    // The reservation is on the admin's Treninzi list before the pause.
    await pressRNW(page.getByTestId("client-detail-tab-treninzi"));
    await expect(page.getByTestId(`booking-row-${bookingId}`)).toBeVisible({
      timeout: 15_000,
    });

    await openPauseSheet(page);

    // The form says what it is about to do — the consequence is invisible from
    // two date fields, so the hint is part of the flow, not decoration.
    await expect(page.getByTestId("pause-consequences-hint")).toHaveText(
      t.admin.clients.pauseHint,
    );

    // Window opens on the anchor's own date so it is running NOW, and runs
    // past the session 48h out.
    await submitPause(page, anchorDateKey(0), anchorDateKey(14));

    // The sheet closes on success — the submit button leaving the DOM is the
    // state signal, not a timer.
    await expect
      .poll(
        async () =>
          page.locator('[data-testid="pause-submit-button"]:visible').count(),
        { timeout: 15_000 },
      )
      .toBe(0);

    // The pause exists, and it took the reservation with it.
    await expect
      .poll(async () => (await findPackagePausesFor(TARGET_CLIENT_EMAIL)).length, {
        timeout: 15_000,
      })
      .toBe(1);
    await expect
      .poll(async () => (await findBookingById(bookingId))?.canceledAt ?? null, {
        timeout: 15_000,
      })
      .not.toBeNull();

    // Admin surface #1: the row is gone from the client's upcoming list. The
    // list settling on its EMPTY state (not just the row vanishing) is what
    // separates "cancelled" from "still fetching" — an absence assertion
    // against a mid-flight list would pass for the wrong reason. This client's
    // only other seeded upcoming booking sits inside the same window, so the
    // pause takes both and the list is genuinely empty.
    await pressRNW(page.getByTestId("client-detail-tab-treninzi"));
    await expect(
      page.getByText(t.admin.clientDetail.noUpcoming, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`booking-row-${bookingId}`)).toHaveCount(0);

    // Admin surface #2: the seat is back in circulation. The schedule block
    // renders "<booked>/<capacity>", so the block reading 0/6 IS the freed
    // seat — the number the studio plans the class from.
    expect(await countActiveBookingsOnSession(sessionId)).toBe(0);
    await page.getByTestId("tab-pregled").click();
    await navigateWeekStripTo(page, sessionDateKey);
    // Attached, not visible: the day grid is an absolutely-positioned axis
    // inside a ScrollView that auto-scrolls to the current hour, so a block at
    // another time of day is mounted but may sit outside the scrolled area.
    // The rendered count is what this asserts, and that is in the DOM either
    // way.
    const block = page.getByTestId(`session-block-${sessionId}`);
    await block.waitFor({ state: "attached", timeout: 15_000 });
    await expect(block).toContainText("0/6", { timeout: 15_000 });
  });

  test("2: the paused client's reservation is gone and the calendar is paused-locked", async ({
    page,
  }) => {
    await signInAs(page, TARGET_CLIENT_EMAIL);

    // The cancelled reservation is off their own upcoming list too. The
    // empty-state copy is the loaded signal — asserting the row's absence
    // against a list that is still fetching would pass without proving
    // anything. Empty is the right expectation here because the pause window
    // also swallowed this client's one seeded booking (the seed places it on
    // the next Reformer slot, which is days away, not weeks).
    await page.goto("/profile");
    await page.getByTestId("client-profile-upcoming-row").dispatchEvent("click");
    await expect(page.getByText(t.client.upcoming.empty)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`booking-row-${bookingId}`)).toHaveCount(0);

    // And they cannot book during the pause. Sessions stay VISIBLE (they own a
    // Reformer pack) but render locked.
    await page.goto("/calendar");
    await navigateWeekStripTo(page, sessionDateKey);

    const row = page.getByTestId(`schedule-row-${sessionId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Locked rendering: the row action is the PAUSED label, not the renewal
    // CTA. The uppercase is CSS text-transform — the DOM text is the raw copy.
    await expect(
      row.getByText(t.client.renewal.rowActionPaused, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Tapping still opens the sheet, which explains the pause and offers no
    // way to book or waitlist.
    await row.dispatchEvent("click");
    const pausedMessage = page.getByTestId("booking-paused-message");
    await expect(pausedMessage).toBeVisible({ timeout: 15_000 });
    await expect(pausedMessage).toContainText(t.client.renewal.pausedMessage);
    await expect(page.getByTestId("booking-book-button")).toHaveCount(0);
    await expect(page.getByTestId("booking-waitlist-button")).toHaveCount(0);
    // The generic renewal copy must NOT be what a paused client is shown —
    // that is the whole point of the reason code.
    await expect(page.getByTestId("booking-renewal-message")).toHaveCount(0);
  });

  test("3: a second pause overlapping the first shows the overlap error", async ({
    page,
  }) => {
    // Driven against the seed's already-paused client (anchor-1d → anchor+7d)
    // rather than re-pausing the client from test 1, so this case does not
    // inherit that test's write and passes on its own.
    const pausesBefore = await findPackagePausesFor(PAUSED_CLIENT_EMAIL);
    expect(pausesBefore).toHaveLength(1);

    await signInAs(page, "admin");
    await openClientDetail(page, PAUSED_CLIENT_NAME);
    await openPauseSheet(page);

    // Overlaps the seeded window from the inside — the boundary-touching case
    // (allowed, half-open windows) is an integration test, not this one.
    await submitPause(page, anchorDateKey(1), anchorDateKey(3));

    // The 409 gets its own copy: "already has a pause in that period", not the
    // generic "pausing failed". Both render through the same ErrorState, so
    // asserting the specific string is the only thing that separates them.
    await expect(
      page.getByText(t.admin.clients.pauseOverlapError, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(t.admin.clients.pauseError, { exact: true }),
    ).toHaveCount(0);

    // The form stays open (a rejected write is not a dismissal) and nothing
    // was written.
    await expect(page.getByTestId("pause-submit-button")).toBeVisible();
    expect(await findPackagePausesFor(PAUSED_CLIENT_EMAIL)).toHaveLength(1);
  });

  test("4: ending a pause early clears the pill and does not restore bookings", async ({
    page,
  }) => {
    // The client from test 1 is the one with a pause AND a booking the pause
    // cancelled — the only way to assert the no-restore rule through the UI.
    const [pause] = await findPackagePausesFor(TARGET_CLIENT_EMAIL);
    expect(pause, "test 1 must have created the pause").toBeTruthy();

    await signInAs(page, "admin");
    await openClientDetail(page, TARGET_CLIENT_NAME);

    // The pill reads "Pauziran" and the end-pause action sits under it. The
    // action renders only when the payload carries the pause id, so its
    // presence is also the proof that `activePause` reached the client.
    // `.first()` would also match the hidden klijenti row behind this screen,
    // which renders the same "Pauziran" chip — assert a VISIBLE one instead,
    // so a stale offscreen node can neither satisfy nor break this.
    await expect(
      page
        .getByText(t.admin.clientDetail.status.paused, { exact: true })
        .locator("visible=true")
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    const endPauseButton = page.getByTestId("client-end-pause-button");
    await expect(endPauseButton).toBeVisible({ timeout: 15_000 });

    // Ending is not an undo, so it asks first — and the message is where the
    // two invisible consequences (expiry moves BACK, bookings stay cancelled)
    // are actually stated.
    await pressRNW(endPauseButton);
    const confirmButton = page.getByTestId("client-end-pause-confirm-button");
    await expect(confirmButton).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(t.admin.clientDetail.endPauseMessage, { exact: true }),
    ).toBeVisible();

    await pressRNW(confirmButton);

    // The pause is over: the pill and the action both go. The action's absence
    // is the sharper signal — it is gated on `activePause`, which the server
    // recomputes from the truncated window.
    await expect(page.getByTestId("client-end-pause-button")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(
      page
        .getByText(t.admin.clientDetail.status.paused, { exact: true })
        .locator("visible=true"),
    ).toHaveCount(0, { timeout: 15_000 });

    // The pause row survives, truncated to now rather than deleted — it
    // started before this moment, so the frozen stretch stays on the record.
    const pausesAfter = await findPackagePausesFor(TARGET_CLIENT_EMAIL);
    expect(pausesAfter).toHaveLength(1);
    expect(pausesAfter[0]!.endsAt.getTime()).toBeLessThan(
      pause!.endsAt.getTime(),
    );

    // And the reservation stays cancelled. Those seats went back into
    // circulation when the pause committed; re-booking them would be guesswork
    // about capacity that has since moved.
    expect((await findBookingById(bookingId))?.canceledAt).not.toBeNull();
    expect(await countActiveBookingsOnSession(sessionId)).toBe(0);
  });

  // Split from test 4 rather than appended to it: `signInAs` drives the
  // /sign-in form, and a second call on a page that already holds an auth
  // session would be redirected off it. Each test gets a fresh context, so
  // switching identity means switching test.
  test("5: after the pause ended, the client's cancelled reservation stays gone", async ({
    page,
  }) => {
    // Guard the ordering assumption rather than trusting it — this reads as a
    // confusing UI failure if test 4 did not actually end the pause.
    const pauses = await findPackagePausesFor(TARGET_CLIENT_EMAIL);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.endsAt.getTime()).toBeLessThanOrEqual(now().getTime());

    await signInAs(page, TARGET_CLIENT_EMAIL);
    await page.goto("/profile");
    await page.getByTestId("client-profile-upcoming-row").dispatchEvent("click");

    // Still empty — ending the pause restored nothing. The empty-state copy is
    // the loaded signal, so this is an assertion about the list's settled
    // contents rather than about a fetch that has not landed.
    await expect(page.getByText(t.client.upcoming.empty)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`booking-row-${bookingId}`)).toHaveCount(0);

    // The pause is over, so the calendar is bookable again — the lock was
    // about the pause, not about their package.
    await page.goto("/calendar");
    await navigateWeekStripTo(page, sessionDateKey);
    const row = page.getByTestId(`schedule-row-${sessionId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(
      row.getByText(t.client.renewal.rowActionPaused, { exact: true }),
    ).toHaveCount(0);
  });
});
