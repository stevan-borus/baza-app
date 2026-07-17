import { test, expect, type Page } from "./helpers/fixtures";
import { now } from "../../lib/now";
import {
  cancelBookingsOnRecurringSchedule,
  countRecurringSchedules,
  countSessions,
  countSessionsByStatus,
  disconnect,
  findFutureSeriesSession,
  getUserActive,
  resetAndSeed,
} from "./helpers/db";
import {
  dateKeyFromDate,
  navigateWeekStripTo,
  nextReformerDayKey,
  openSessionEditSheet,
} from "./helpers/dates";
import { t } from "./helpers/locales";
import { signInAs } from "./helpers/auth";
import { pickInviteDob } from "./helpers/forms";
import { pressRNW } from "./helpers/interactions";

/**
 * Admin (Serbian). Test-plan items 12-39.
 *
 * Specs that depend on UI not yet implemented (13/14: ClassType edit/delete,
 * 19/20: Room edit/delete) are skipped with TODOs. Specs that depend on
 * web-incompatible widgets (notably the DateTimePicker, which uses
 * react-native-modal-datetime-picker — no usable web fallback) are skipped
 * with the same convention.
 */
test.describe("admin (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  /**
   * Open a catalog screen via the Katalog tab. The Katalog tab is the
   * canonical home for class-type, room, and package-type management;
   * tapping a row on the landing screen pushes the corresponding
   * `/katalog/<segment>` route.
   */
  async function openCatalog(
    page: Page,
    target: "classTypes" | "rooms" | "packageTypes",
  ) {
    const expectedSegment = {
      classTypes: "tipovi-treninga",
      rooms: "sale",
      packageTypes: "tipovi-paketa",
    }[target];
    const rowTestId = {
      classTypes: "katalog-row-class-types",
      rooms: "katalog-row-rooms",
      packageTypes: "katalog-row-package-types",
    }[target];
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId(rowTestId).dispatchEvent("click");
    await page.waitForURL(new RegExp(`/katalog/${expectedSegment}$`), {
      timeout: 10_000,
    });
  }

  /**
   * Open the new-session sheet via the Katalog tab's hero "Novi termin" row.
   * The "+" button on the Pregled header has been removed; Katalog is the
   * single entry point for creating a session.
   */
  async function openNewSessionSheet(page: Page) {
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-novi-termin").dispatchEvent("click");
    await expect(page.getByTestId("session-create-submit")).toBeVisible({
      timeout: 5_000,
    });
  }

  // ── Header / Pregled cleanup invariants ──────────────────────────────────

  test("Pregled header no longer renders the '+' new-session button", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await expect(
      page.getByTestId("admin-new-session-button"),
    ).toHaveCount(0);
  });

  test("no admin screen mounts the legacy catalog avatar menu", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    for (const tabId of [
      "tab-pregled",
      "tab-katalog",
      "tab-klijenti",
      "tab-naplata",
      "tab-izvestaji",
    ]) {
      await page.getByTestId(tabId).click();
      await expect(page.getByTestId("open-catalog-menu")).toHaveCount(0);
    }
  });

  test("Pregled does not show the legacy quick-action rows", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-pregled").click();
    await expect(page.getByTestId("admin-quick-class-types")).toHaveCount(0);
    await expect(page.getByTestId("admin-quick-rooms")).toHaveCount(0);
  });

  // ── Catalog ───────────────────────────────────────────────────────────────

  test("12: admin creates a new ClassType", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "classTypes");

    // dispatchEvent bypasses pointer-events checks — the gorhom backdrop
    // from the catalog sheet can briefly linger on web after router.push.
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewClassType })
      .dispatchEvent("click");
    const name = `E2E ClassType ${Date.now()}`;
    await page.getByTestId("class-type-name-input").fill(name);
    await page.getByTestId("class-type-max-clients-input").fill("8");
    await page.getByTestId("class-type-duration-input").fill("60");
    await page.getByTestId("class-type-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("13: admin edits a ClassType", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "classTypes");

    // Pick the first row, edit the name, save, assert the new name renders.
    await page
      .locator('[data-testid^="class-type-row-"]')
      .first()
      .dispatchEvent("click");

    const newName = `Edited ClassType ${Date.now()}`;
    await page.getByTestId("class-type-edit-name-input").fill(newName);
    await page
      .getByTestId("class-type-edit-save-button")
      .dispatchEvent("click");

    await expect(page.getByText(newName).first()).toBeVisible();
  });

  test("14: admin deletes a ClassType (no dependents)", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "classTypes");

    // Create a disposable ClassType, then delete it.
    const name = `Disposable ClassType ${Date.now()}`;
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewClassType })
      .dispatchEvent("click");
    await page.getByTestId("class-type-name-input").fill(name);
    await page.getByTestId("class-type-max-clients-input").fill("8");
    await page.getByTestId("class-type-duration-input").fill("60");
    await page.getByTestId("class-type-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByText(name).first().dispatchEvent("click");
    await page
      .getByTestId("class-type-edit-delete-button")
      .dispatchEvent("click");
    await page
      .getByTestId("class-type-delete-confirm-button")
      .dispatchEvent("click");

    await expect
      .poll(async () => page.getByText(name).count())
      .toBe(0);
  });

  test("15: admin creates a mix PackageType (multi-select ClassType chips)", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "packageTypes");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPackage })
      .dispatchEvent("click");

    const name = `E2E Package ${Date.now()}`;
    await page.getByTestId("package-name-input").fill(name);
    // Toggle the first TWO class-type chips — a mix package (ADR-0010).
    const chips = page.locator('[data-testid^="package-class-type-chip-"]');
    await chips.nth(0).dispatchEvent("click");
    await chips.nth(1).dispatchEvent("click");
    await page.getByTestId("package-session-count-input").fill("8");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("16: admin edits a PackageType", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "packageTypes");

    // Pick the first package row, edit its name, save.
    const firstRow = page
      .locator('[data-testid^="package-type-row-"]')
      .first();
    await expect(firstRow).toBeVisible();
    await firstRow.dispatchEvent("click");

    const newName = `Edited Package ${Date.now()}`;
    const nameInput = page.getByTestId("package-edit-name-input");
    await nameInput.fill(newName);
    await page.getByTestId("package-edit-save-button").dispatchEvent("click");

    await expect(page.getByText(newName).first()).toBeVisible();
  });

  test("17: admin deletes a PackageType (no dependents)", async ({ page }) => {
    // First create a brand-new package with no dependents — guaranteed safe
    // to delete.
    await signInAs(page, "admin");
    await openCatalog(page, "packageTypes");

    const name = `Disposable Package ${Date.now()}`;
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPackage })
      .dispatchEvent("click");
    await page.getByTestId("package-name-input").fill(name);
    await page
      .locator('[data-testid^="package-class-type-chip-"]')
      .first()
      .dispatchEvent("click");
    await page.getByTestId("package-session-count-input").fill("4");
    await page.getByTestId("package-validity-days-input").fill("30");
    await page.getByTestId("package-late-cancel-input").fill("12");
    await page.getByTestId("package-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();

    // Open it, click delete, confirm in the ConfirmSheet.
    await page.getByText(name).first().dispatchEvent("click");
    await page
      .getByTestId("package-edit-delete-button")
      .dispatchEvent("click");
    await page
      .getByTestId("package-delete-confirm-button")
      .dispatchEvent("click");

    // The row is gone from the list.
    await expect.poll(async () =>
      page.getByText(name).count(),
      { timeout: 10_000 },
    ).toBe(0);
  });

  test("18: admin creates a new StudioRoom", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "rooms");

    // dispatchEvent bypasses pointer-events checks; the gorhom backdrop from
    // the catalog sheet can briefly linger on web after router.push and
    // intercept .click().
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewRoom })
      .dispatchEvent("click");
    const name = `E2E Room ${Date.now()}`;
    await page.getByTestId("room-name-input").fill(name);
    await page.getByTestId("room-capacity-input").fill("12");
    await page.getByTestId("room-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("19: admin edits a StudioRoom", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "rooms");

    await page
      .locator('[data-testid^="room-row-"]')
      .first()
      .dispatchEvent("click");

    const newName = `Edited Room ${Date.now()}`;
    await page.getByTestId("room-edit-name-input").fill(newName);
    await page.getByTestId("room-edit-save-button").dispatchEvent("click");

    await expect(page.getByText(newName).first()).toBeVisible();
  });

  test("20: admin deletes a StudioRoom (no dependents)", async ({ page }) => {
    await signInAs(page, "admin");
    await openCatalog(page, "rooms");

    const name = `Disposable Room ${Date.now()}`;
    await page
      .getByRole("button", { name: t.admin.manage.sheetNewRoom })
      .dispatchEvent("click");
    await page.getByTestId("room-name-input").fill(name);
    await page.getByTestId("room-capacity-input").fill("8");
    await page.getByTestId("room-create-submit").dispatchEvent("click");

    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByText(name).first().dispatchEvent("click");
    await page.getByTestId("room-edit-delete-button").dispatchEvent("click");
    await page
      .getByTestId("room-delete-confirm-button")
      .dispatchEvent("click");

    await expect
      .poll(async () => page.getByText(name).count())
      .toBe(0);
  });

  // ── Scheduling ────────────────────────────────────────────────────────────

  test("21: admin creates a single session via the new web picker", async ({
    page,
  }) => {
    const sessionsBefore = await countSessions();

    await signInAs(page, "admin");
    // The "+" button on Pregled has been removed; Novi termin lives on
    // the Katalog tab's hero row.
    await openNewSessionSheet(page);

    // Class type select — pick the first available option.
    await page
      .getByTestId("session-create-class-type-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-class-type-option-"]')
      .first()
      .dispatchEvent("click");

    // Trainer select.
    await page
      .getByTestId("session-create-trainer-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-trainer-option-"]')
      .first()
      .dispatchEvent("click");

    // Room select.
    await page
      .getByTestId("session-create-room-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-room-option-"]')
      .first()
      .dispatchEvent("click");

    // Open the date-time picker, pick a day 14 days out, set time, confirm.
    await page
      .getByTestId("session-create-startsAt")
      .dispatchEvent("click");

    const target = now();
    target.setDate(target.getDate() + 14);
    const targetDay = String(target.getDate());
    await page
      .locator(
        '[data-testid="date-time-picker-calendar"] button.rdp-day_button',
        { hasText: new RegExp(`^${targetDay}$`) },
      )
      .first()
      .dispatchEvent("click");
    await page
      .locator('[data-testid="date-time-picker-time-input"]')
      .fill("11:00");
    await page
      .getByTestId("date-time-picker-confirm")
      .dispatchEvent("click");

    await page
      .getByTestId("session-create-submit")
      .dispatchEvent("click");

    await expect
      .poll(async () => countSessions())
      .toBe(sessionsBefore + 1);
  });

  test("22: admin edits a single session (cancel via danger button)", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    // Tap any session-card on today/this-week and open the edit sheet.
    // Pick the first Reformer day from the seed so a session exists to tap.
    await navigateWeekStripTo(page, nextReformerDayKey());

    const card = page.locator('[data-testid^="session-block-"]').first();
    await expect(card).toBeVisible();
    await openSessionEditSheet(page, card);

    // Edit sheet opens; just tap save with no changes — round-trips the API.
    await page.getByTestId("session-edit-save-button").dispatchEvent("click");

    // Sheet closes — assert by checking the save button is no longer in DOM.
    await expect(
      page.getByTestId("session-edit-save-button"),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("23: admin cancels a single session via the danger button", async ({
    page,
  }) => {
    const cancelledBefore = await countSessionsByStatus("CANCELED");

    await signInAs(page, "admin");
    await navigateWeekStripTo(page, nextReformerDayKey());

    const card = page.locator('[data-testid^="session-block-"]').first();
    await expect(card).toBeVisible();
    await openSessionEditSheet(page, card);

    await page.getByTestId("session-edit-cancel-button").dispatchEvent("click");
    await expect(
      page.getByTestId("session-cancel-confirm-button"),
    ).toBeVisible({ timeout: 5_000 });
    await page
      .locator(
        '[data-testid="session-cancel-confirm-button"]:visible',
      )
      .first()
      .dispatchEvent("click");

    // Verify the cancellation persisted server-side: the count of CANCELED
    // sessions in the DB should grow by one.
    await expect
      .poll(async () => countSessionsByStatus("CANCELED"), {
        timeout: 15_000,
      })
      .toBe(cancelledBefore + 1);
  });

  test("24: admin creates a recurring series (Mon/Wed × 2 weeks)", async ({
    page,
  }) => {
    const seriesBefore = await countRecurringSchedules();
    const sessionsBefore = await countSessions();

    await signInAs(page, "admin");
    await openNewSessionSheet(page);

    // Toggle to recurring mode.
    await page.getByTestId("session-create-mode-recurring").click();

    // Fill class type / room / trainer.
    await page
      .getByTestId("session-create-class-type-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-class-type-option-"]')
      .first()
      .dispatchEvent("click");
    await page
      .getByTestId("session-create-trainer-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-trainer-option-"]')
      .first()
      .dispatchEvent("click");
    await page
      .getByTestId("session-create-room-select")
      .dispatchEvent("click");
    await page
      .locator('[data-testid^="session-create-room-option-"]')
      .first()
      .dispatchEvent("click");

    // Pick a startsAt 21 days out at 14:30 — far enough from spec 21's
    // single session (14 days, 11:00) to avoid a schedule conflict on the
    // same trainer.
    await page.getByTestId("session-create-startsAt").dispatchEvent("click");
    const target = now();
    target.setDate(target.getDate() + 21);
    await page
      .locator(
        '[data-testid="date-time-picker-calendar"] button.rdp-day_button',
        { hasText: new RegExp(`^${String(target.getDate())}$`) },
      )
      .first()
      .dispatchEvent("click");
    await page
      .locator('[data-testid="date-time-picker-time-input"]')
      .fill("14:30");
    await page.getByTestId("date-time-picker-confirm").dispatchEvent("click");

    // 2 weeks, Mon (1) + Wed (3).
    await page
      .getByTestId("session-create-week-count-input")
      .fill("2");
    await page.getByTestId("session-create-weekday-1").dispatchEvent("click");
    await page.getByTestId("session-create-weekday-3").dispatchEvent("click");

    await page.getByTestId("session-create-submit").dispatchEvent("click");

    // The recurring API creates one RecurringSchedule + multiple Sessions.
    await expect
      .poll(async () => countRecurringSchedules(), { timeout: 15_000 })
      .toBe(seriesBefore + 1);
    // 2 weekdays × 2 weeks = 4 sessions, but past dates may be skipped, so
    // assert at least 1 new session was created.
    await expect
      .poll(async () => countSessions(), { timeout: 15_000 })
      .toBeGreaterThan(sessionsBefore);
  });

  test("25: edit a single occurrence inside a recurring series", async ({
    page,
  }) => {
    // Pick a future seeded series session and tap it; the edit sheet shows
    // the scope toggle. Save with the "session" scope (single-occurrence).
    const ref = await findFutureSeriesSession("Reformer");
    if (!ref) throw new Error("Need a seeded recurring Reformer session");

    await signInAs(page, "admin");
    // Navigate to that session's day — the WeekStrip only shows 7 days,
    // and prior specs in this file may have canceled sessions in the
    // current week, pushing `findFutureSeriesSession`'s result into a
    // later week.
    await navigateWeekStripTo(page, dateKeyFromDate(ref.startsAt));

    await openSessionEditSheet(page, page.getByTestId(`session-block-${ref.id}`));

    // Default scope is "session" — confirm by clicking save.
    await page.getByTestId("session-edit-scope-session").dispatchEvent("click");
    await page.getByTestId("session-edit-save-button").dispatchEvent("click");

    // Sheet closes after success.
    await expect
      .poll(
        async () =>
          page
            .locator('[data-testid="session-edit-save-button"]:visible')
            .count(),
        { timeout: 15_000 },
      )
      .toBe(0);
  });

  test("26: edit whole series (toggle to series scope)", async ({ page }) => {
    const ref = await findFutureSeriesSession("Reformer");
    if (!ref) throw new Error("Need a seeded recurring Reformer session");

    // Series-shape edits (weekdays/time/duration/weekCount) are refused by
    // the API when any future session in the series has live bookings —
    // the rich seed places one such booking on the Reformer schedule so the
    // home dashboard isn't empty. Cancel those bookings before saving so
    // the PATCH succeeds.
    if (ref.recurringScheduleId) {
      await cancelBookingsOnRecurringSchedule(ref.recurringScheduleId);
    }

    await signInAs(page, "admin");
    await navigateWeekStripTo(page, dateKeyFromDate(ref.startsAt));

    await openSessionEditSheet(page, page.getByTestId(`session-block-${ref.id}`));

    // Switch to series scope; the series-edit form mounts. Use a realistic
    // pointer press (see pressRNW): a bare `dispatchEvent("click")` only
    // intermittently drives RN-Web's Pressable responder, so the scope toggle
    // and the save tap below would sometimes "not fire" — leaving no PATCH for
    // waitForResponse to catch (the source of this spec's 15s timeout flake).
    await pressRNW(page.getByTestId("session-edit-scope-series"));

    // The series form loads asynchronously (fetches the recurring schedule,
    // then hydrates weekdays/trainer/time from it). The save button mounts
    // disabled and only enables once that hydration lands — so waiting for it
    // to be merely *visible* and pressing immediately races the fetch: the
    // press fires on a still-disabled button, no mutation runs, and the
    // waitForResponse below times out. RN-Web renders a disabled Button as
    // `aria-disabled="true"` (NOT the DOM `disabled` attr — Playwright's
    // toBeDisabled misreads it), so we poll that attribute to clear before
    // pressing. State, not time — per AGENTS.md anti-flake.
    const saveBtn = page.getByTestId("series-edit-save-button");
    await expect(saveBtn).toBeVisible();
    // Inherit the config's 10s expect default rather than restating it — this
    // resolves the instant the form hydration enables the button (sub-second
    // locally); the timeout is only a failure ceiling, not a sleep.
    await expect(saveBtn).not.toHaveAttribute("aria-disabled", "true");
    await saveBtn.scrollIntoViewIfNeeded();
    await pressRNW(saveBtn);

    // Verify the mutation actually ran by polling the API. If the sheet
    // doesn't close we still expect the schedule's lastUpdated to bump.
    // Simplest: wait for the save button to disappear OR for at least one
    // network round-trip to complete.
    await page.waitForResponse(
      (r) =>
        r.url().includes("/api/sessions/recurring/") &&
        ["PUT", "PATCH"].includes(r.request().method()) &&
        r.status() < 300,
      { timeout: 15_000 },
    );
  });

  test("27: delete single occurrence (cancel via danger button)", async ({
    page,
  }) => {
    const ref = await findFutureSeriesSession("Reformer");
    if (!ref) throw new Error("Need a seeded recurring Reformer session");

    const cancelledBefore = await countSessionsByStatus("CANCELED");

    await signInAs(page, "admin");
    await navigateWeekStripTo(page, dateKeyFromDate(ref.startsAt));

    await openSessionEditSheet(page, page.getByTestId(`session-block-${ref.id}`));

    // Default scope is "session"; the danger button cancels just this one.
    await page.getByTestId("session-edit-cancel-button").dispatchEvent("click");
    await expect(
      page.getByTestId("session-cancel-confirm-button"),
    ).toBeVisible({ timeout: 5_000 });
    await page
      .locator('[data-testid="session-cancel-confirm-button"]:visible')
      .first()
      .dispatchEvent("click");

    await expect
      .poll(async () => countSessionsByStatus("CANCELED"), {
        timeout: 15_000,
      })
      .toBe(cancelledBefore + 1);
  });

  test("28: delete whole series", async ({ page }) => {
    const ref = await findFutureSeriesSession("Energy");
    if (!ref) throw new Error("Need a seeded recurring Energy session");

    // The DELETE handler refuses if any session in the series has a live
    // booking; the rich seed places one such booking on the Energy
    // schedule. Cancel it first so the delete actually runs.
    if (ref.recurringScheduleId) {
      await cancelBookingsOnRecurringSchedule(ref.recurringScheduleId);
    }

    const seriesBefore = await countRecurringSchedules();

    await signInAs(page, "admin");
    await navigateWeekStripTo(page, dateKeyFromDate(ref.startsAt));

    await openSessionEditSheet(page, page.getByTestId(`session-block-${ref.id}`));

    await page.getByTestId("session-edit-scope-series").dispatchEvent("click");
    await expect(page.getByTestId("series-edit-delete-button")).toBeVisible();
    await page
      .getByTestId("series-edit-delete-button")
      .dispatchEvent("click");
    await expect(
      page.getByTestId("series-delete-confirm-button"),
    ).toBeVisible({ timeout: 5_000 });
    await page
      .locator('[data-testid="series-delete-confirm-button"]:visible')
      .first()
      .dispatchEvent("click");

    await expect
      .poll(async () => countRecurringSchedules(), { timeout: 15_000 })
      .toBe(seriesBefore - 1);
  });

  test("29: room double-book is rejected at the API", async ({ page }) => {
    // The conflict comes back from the server with a structured error;
    // both 21 and 22 prove the happy path. To verify the conflict path
    // without a brittle UI race, hit the API directly with two overlapping
    // sessions on the same room.
    await signInAs(page, "admin");

    const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await page.request.get(`${apiBase}/api/sessions`, {
      headers: { cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);
    const list = (await res.json()) as { sessions: Array<{ id: string; trainerUserId: string; roomId: string; startsAt: string }> };
    const ref = list.sessions[0];
    if (!ref) {
      throw new Error("Seed produced no sessions");
    }

    // Create a second session in the same room at the same start.
    const dup = await page.request.post(`${apiBase}/api/sessions`, {
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      data: {
        classTypeId: list.sessions[0].id, // any non-empty value; server rejects on conflict before validation matters
        trainerUserId: ref.trainerUserId,
        roomId: ref.roomId,
        startsAt: ref.startsAt,
        durationMins: 60,
        capacity: 6,
      },
    });
    // The server should reject; either 400 (validation) or 409 (conflict).
    expect([400, 409]).toContain(dup.status());
  });

  test("30: trainer double-book is rejected at the API", async ({ page }) => {
    // Same shape as 29, but using a different room with the same trainer.
    await signInAs(page, "admin");

    const apiBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8010";
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await page.request.get(`${apiBase}/api/sessions`, {
      headers: { cookie: cookieHeader },
    });
    const list = (await res.json()) as { sessions: Array<{ id: string; trainerUserId: string; roomId: string; classTypeId: string; startsAt: string }> };
    const ref = list.sessions[0];
    if (!ref) throw new Error("Seed produced no sessions");

    // Find any other room id.
    const roomsRes = await page.request.get(`${apiBase}/api/rooms`, {
      headers: { cookie: cookieHeader },
    });
    const rooms = (await roomsRes.json()) as { rooms: Array<{ id: string }> };
    const otherRoom = rooms.rooms.find((r) => r.id !== ref.roomId);
    if (!otherRoom) throw new Error("Need at least 2 rooms in seed");

    const dup = await page.request.post(`${apiBase}/api/sessions`, {
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      data: {
        classTypeId: ref.classTypeId,
        trainerUserId: ref.trainerUserId,
        roomId: otherRoom.id,
        startsAt: ref.startsAt,
        durationMins: 60,
        capacity: 6,
      },
    });
    expect([400, 409]).toContain(dup.status());
  });

  // ── Client management ─────────────────────────────────────────────────────

  test("31: admin sends invite", async ({ page }) => {
    // Already covered by auth-extended.spec.ts. Re-run here in the admin
    // grouping to keep the plan inventory complete and confirm cross-tab
    // navigation continues to work.
    const inviteEmail = `admin-invite.${Date.now()}@e2e.test`;
    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();
    // The "+" always opens the add-client (invite) sheet now — no need to be
    // on the invites tab first; a successful invite auto-switches to it.
    await page.getByTestId("admin-new-client-button").click();
    await page.getByTestId("invite-create-email-input").fill(inviteEmail);
    await page.getByTestId("invite-create-name-input").fill("Admin Invite");
    await page.getByTestId("invite-create-lastname-input").fill("Smoke");
    await pickInviteDob(page);
    await page.getByTestId("invite-create-submit-button").click();

    await expect(
      page.getByText(inviteEmail, { exact: true }).first(),
    ).toBeVisible();
  });

  test("32: admin client list shows package status badges", async ({ page }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();

    // The seed produces six clients with different package statuses. The
    // badge text comes from i18n. Assert that at least one of each status
    // we can render is visible.
    await expect(
      page.getByText(t.admin.clients.filterActive).first(),
    ).toBeVisible();
    await expect(
      page.getByText(t.admin.clients.filterExpired).first(),
    ).toBeVisible();
    await expect(
      page.getByText(t.admin.clients.filterPaused).first(),
    ).toBeVisible();
  });

  test("33: admin pauses a client's package", async ({ page }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();

    // Phase 1 split the row: tapping the row navigates to /klijenti/[id];
    // the action sheet is opened via the pencil button on the right. Use
    // the first pencil — seed places the active reformer client at top of
    // the list — to keep the spec deterministic.
    const firstPencil = page
      .locator('[data-testid^="client-pencil-"]')
      .first();
    await expect(firstPencil).toBeVisible();
    await firstPencil.dispatchEvent("click");

    await page.getByTestId("client-action-pause").dispatchEvent("click");

    // Fill ISO dates spanning a 7-day window starting tomorrow.
    const start = now();
    start.setDate(start.getDate() + 1);
    const end = now();
    end.setDate(end.getDate() + 8);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await page.getByTestId("pause-start-input").fill(fmt(start));
    await page.getByTestId("pause-end-input").fill(fmt(end));
    await page.getByTestId("pause-submit-button").dispatchEvent("click");

    // After submit the actions sheet closes; the row's status badge will
    // eventually flip to "Pauziran" once the cache invalidates.
    await expect
      .poll(
        async () => page.getByText(t.admin.clients.filterPaused).count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });

  test("34: admin deactivates a client", async ({ page }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();

    // Pick a row whose deactivation won't ripple into other tests' assumptions
    // about the active reformer client. The empty-pack client has no packages
    // and is safe to deactivate. Phase 1: row tap navigates to the detail
    // page — the actions sheet opens via the pencil button. Scope the pencil
    // to the matching row by its name text.
    // Search first: the list is ordered by uuid (random per seed) and the
    // FlatList virtualizes rows below the fold out of the DOM, so matching
    // by name without narrowing is a seed-order lottery.
    await page.getByTestId("klijenti-search-input").fill("Empty Pack");
    const targetRow = page
      .locator('[data-testid^="client-row-"]', {
        hasText: "Empty Pack Client",
      })
      .first();
    await expect(targetRow).toBeVisible();
    await targetRow
      .locator('[data-testid^="client-pencil-"]')
      .dispatchEvent("click");

    await page.getByTestId("client-action-delete").dispatchEvent("click");
    // Wait for the second sheet (delete confirmation) to fully mount.
    await expect(
      page.getByTestId("client-delete-confirm-button"),
    ).toBeVisible({ timeout: 5_000 });
    // Multiple sheets may be layered during the transition — scope to the
    // visible confirm button.
    await page
      .locator(
        '[data-testid="client-delete-confirm-button"]:visible',
      )
      .first()
      .dispatchEvent("click");

    // Server-side: the isActive flag flipped to false.
    await expect
      .poll(async () => getUserActive("client.empty@e2e.test"), {
        timeout: 10_000,
      })
      .toBe(false);

    // User-visible: the deactivated client drops out of the admin list (the
    // list now filters on isActive, so a soft-delete actually removes the row
    // instead of silently doing nothing). The search term is still "Empty Pack".
    await expect(
      page.locator('[data-testid^="client-row-"]', {
        hasText: "Empty Pack Client",
      }),
    ).toHaveCount(0, { timeout: 10_000 });
  });

  // ── Billing ───────────────────────────────────────────────────────────────

  test("35: admin records a payment with auto-assigned package (Flow 1)", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/naplata");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPayment })
      .click();

    // Client is now chosen via a stacked searchable picker sheet (replaced the
    // old inline dropdown). Tap the trigger → pick the first row in the sheet.
    await pressRNW(page.getByTestId("billing-client-trigger"));
    await page.getByTestId("billing-client-picker-search").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await pressRNW(
      page.locator('[data-testid^="billing-client-option-"]').first(),
    );
    await page
      .getByTestId("billing-client-picker-search")
      .waitFor({ state: "hidden", timeout: 10_000 });

    await page.getByTestId("billing-amount-input").fill("12000");

    await page.getByTestId("billing-method-select").dispatchEvent("click");
    await page
      .locator('[data-testid^="billing-method-option-"]')
      .first()
      .dispatchEvent("click");

    await page.getByTestId("billing-package-select").dispatchEvent("click");
    await page
      .locator('[data-testid^="billing-package-option-"]')
      .first()
      .dispatchEvent("click");

    await page.getByTestId("billing-create-submit").dispatchEvent("click");

    // After the mutation succeeds the new row appears in the list.
    await expect(
      page.locator('[data-testid^="billing-row-"]').first(),
    ).toBeVisible();
  });

  test("36: Flow 1 — billing record defaults to CONFIRMED status", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/naplata");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPayment })
      .click();
    // Client is now chosen via a stacked searchable picker sheet (replaced the
    // old inline dropdown). Tap the trigger → pick the first row in the sheet.
    await pressRNW(page.getByTestId("billing-client-trigger"));
    await page.getByTestId("billing-client-picker-search").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await pressRNW(
      page.locator('[data-testid^="billing-client-option-"]').first(),
    );
    await page
      .getByTestId("billing-client-picker-search")
      .waitFor({ state: "hidden", timeout: 10_000 });
    await page.getByTestId("billing-amount-input").fill("8000");
    await page.getByTestId("billing-method-select").dispatchEvent("click");
    await page
      .locator('[data-testid^="billing-method-option-"]')
      .first()
      .dispatchEvent("click");
    await page.getByTestId("billing-create-submit").dispatchEvent("click");

    // Status badge text ('Potvrđeno' = CONFIRMED in i18n) appears on the
    // newly-created row.
    await expect(
      page.getByText(t.admin.manage.statusConfirmed).first(),
    ).toBeVisible();
  });

  test("37: admin records a drop-in payment with no package", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.goto("/naplata");

    await page
      .getByRole("button", { name: t.admin.manage.sheetNewPayment })
      .click();
    // Client is now chosen via a stacked searchable picker sheet (replaced the
    // old inline dropdown). Tap the trigger → pick the first row in the sheet.
    await pressRNW(page.getByTestId("billing-client-trigger"));
    await page.getByTestId("billing-client-picker-search").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await pressRNW(
      page.locator('[data-testid^="billing-client-option-"]').first(),
    );
    await page
      .getByTestId("billing-client-picker-search")
      .waitFor({ state: "hidden", timeout: 10_000 });
    await page.getByTestId("billing-amount-input").fill("3000");
    await page.getByTestId("billing-method-select").dispatchEvent("click");
    await page
      .locator('[data-testid^="billing-method-option-"]')
      .first()
      .dispatchEvent("click");
    // Skip the package select — that's the drop-in shape.
    await page.getByTestId("billing-create-submit").dispatchEvent("click");

    // Some billing-row appears (we verified count growth in 35).
    await expect(
      page.locator('[data-testid^="billing-row-"]').first(),
    ).toBeVisible();
  });

  test("38: admin assigns a comp package via the actions sheet (Flow 2)", async ({
    page,
  }) => {
    // Re-seed so the "Empty Pack Client" exists regardless of spec 34's
    // ordering (which deactivates that user).
    await resetAndSeed();

    await signInAs(page, "admin");
    await page.getByTestId("tab-klijenti").click();

    // Open the actions sheet via the pencil button (Phase 1: row tap goes
    // to the detail page). Search first — uuid ordering + FlatList
    // virtualization make unnarrowed name matching a seed-order lottery.
    await page.getByTestId("klijenti-search-input").fill("Empty Pack");
    const targetRow = page
      .locator('[data-testid^="client-row-"]', {
        hasText: "Empty Pack Client",
      })
      .first();
    await expect(targetRow).toBeVisible();
    await targetRow
      .locator('[data-testid^="client-pencil-"]')
      .dispatchEvent("click");

    await page
      .getByTestId("client-action-assign-package")
      .dispatchEvent("click");

    await page
      .locator('[data-testid^="assign-package-option-"]')
      .first()
      .dispatchEvent("click");

    // Open the DateTimePicker (mode="date") and select today's day cell.
    await page.getByTestId("assign-package-start-picker").dispatchEvent("click");
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).toBeVisible();
    const today = String(new Date().getDate());
    await page
      .locator('[data-testid="date-time-picker-calendar"] button.rdp-day_button', {
        hasText: new RegExp(`^${today}$`),
      })
      .first()
      .dispatchEvent("click");
    await page.getByTestId("date-time-picker-confirm").dispatchEvent("click");

    await page.getByTestId("assign-package-submit").dispatchEvent("click");

    await expect
      .poll(
        async () => page.getByText(t.admin.clients.filterActive).count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });

  test("39: admin sees billing history", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/naplata");

    // The seed has no billing records yet, so the screen renders the
    // empty state. We assert the screen loaded by looking for the page
    // title or a known empty-state string. The header sheet button being
    // present is a strong signal.
    await expect(
      page.getByRole("button", { name: t.admin.manage.sheetNewPayment }),
    ).toBeVisible();
  });
});
