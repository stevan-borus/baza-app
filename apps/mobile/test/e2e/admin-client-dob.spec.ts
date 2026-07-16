import { test, expect } from "./helpers/fixtures";
import { signInAs } from "./helpers/auth";
import { disconnect, resetAndSeed } from "./helpers/db";
import { pickInviteDob } from "./helpers/forms";

/**
 * PR 1 of "Client Date of Birth Capture": e2e smoke.
 *
 * Two assertions, intentionally narrow:
 *   1. The seeded `Active Reformer Client` (DOB 1990-05-11) shows the DOB on
 *      the admin detail header in the Serbian "11.05.1990." format.
 *   2. The new invite sheet renders the DOB picker without crashing the flow:
 *      tap the DOB field, the WebDateTimeSheet's calendar mounts, escape out,
 *      submit the invite without a DOB, and assert the invite row appears.
 *
 * We deliberately avoid driving a day-cell click here — `react-day-picker`
 * cell selection on web has been flaky across browsers in past specs (see
 * helpers/dates.ts). The DB-level "DOB round-trips end-to-end" assertion
 * lives in the integration suite (Tasks 5/6) where we have direct DB access.
 */
test.describe("admin client DOB (Serbian)", () => {
  test.beforeAll(async () => {
    await resetAndSeed();
  });
  test.afterAll(async () => {
    await disconnect();
  });

  test("admin sees a seeded client's DOB on the detail screen and can open the invite DOB picker without crashing", async ({
    page,
  }) => {
    await signInAs(page, "admin");

    // ── 1. DOB renders on the admin client-detail header ─────────────────
    await page.getByTestId("tab-klijenti").click();
    // Search first: the klijenti list is a virtualized FlatList with uuid
    // ordering, so a bare row-match is a per-seed lottery (the target row may
    // be rendered off-screen). Filtering to the one client guarantees the row
    // is mounted before we tap it. See CONTEXT/memory: klijenti specs search
    // before asserting rows.
    await page.getByTestId("klijenti-search-input").fill("Active Reformer Client");
    // Tapping the row navigates to `/klijenti/<userId>` (Phase 1 split:
    // pencil opens actions sheet, row tap goes to detail).
    await page.getByText("Active Reformer Client").first().click();

    // Format from lib/date-of-birth.ts:
    //   formatDateOfBirth(parseDateOfBirth("1990-05-11"), "sr")
    //   === "11.05.1990." (note the trailing dot — Serbian convention).
    await expect(page.getByText("11.05.1990.")).toBeVisible();

    // ── 2. Invite flow renders the DOB picker without crashing ───────────
    // Navigate back to Klijenti and open the add-client (invite) sheet — the
    // "+" always opens the invite flow now, regardless of the active tab.
    await page.getByTestId("tab-klijenti").click();
    await page.getByTestId("admin-new-client-button").click();

    const inviteEmail = `e2e-dob-${Date.now()}@test.local`;
    await page.getByTestId("invite-create-email-input").fill(inviteEmail);
    await page.getByTestId("invite-create-name-input").fill("E2E DOB");
    await page.getByTestId("invite-create-lastname-input").fill("Client");

    // Tap the DOB field — WebDateTimeSheet mounts inside an AppSheet
    // (gorhom BottomSheetModal, no ARIA `dialog` role). Assert the
    // calendar testID is visible, then pick a valid day: DOB is REQUIRED to
    // enable the invite submit (consent gate, #32), so the old "cancel and
    // submit without a DOB" flow no longer reflects the form.
    await page.getByTestId("invite-create-dob-input").click();
    await expect(
      page.locator('[data-testid="date-time-picker-calendar"]'),
    ).toBeVisible({ timeout: 5_000 });

    await pickInviteDob(page);

    await page.getByTestId("invite-create-submit-button").click();

    // The new pending invite appears in the Invites tab list.
    await expect(
      page.getByText(inviteEmail, { exact: true }).first(),
    ).toBeVisible();
  });
});
