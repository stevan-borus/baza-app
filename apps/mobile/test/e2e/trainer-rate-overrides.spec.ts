/**
 * Per-class-type trainer commission overrides, end to end.
 *
 * A trainer's cut is not one number: an individual or a duo is worth a
 * different percentage than a group slot. So a class type can carry its own
 * override, everything else stays on the base rate, and ending an override is
 * an append-only tombstone rather than a delete — settled months must not move.
 *
 * The claims only e2e can settle, because they cross the rate screen, the
 * /api/payroll/rates write, the month engine's bucketing, and two separate
 * payout surfaces:
 *
 *   1. An override backdated into the running month reprices ONLY its own
 *      class type. The other class type stays at the base percent, and the
 *      hero payout is the SUM of the visible bucket rows — the server rounds
 *      per bucket, so a total computed any other way would drift from the
 *      arithmetic the admin is reading.
 *   2. The trainer sees that same breakdown on their own Moja zarada. A payout
 *      a trainer cannot check is one they have to take on trust.
 *   3. The roster row advertises that the trainer has special rates at all.
 *   4. The tombstone folds the class type back into the default bucket, and
 *      the row goes back to reading as inherited.
 *
 * Rate resolution happens at MONTH START, which is what makes every date here
 * load-bearing: an override effective today would NOT touch the running month.
 * Both writes below are therefore backdated to the 1st, derived from the
 * anchor instant rather than real now.
 */
import { test, expect, type Page } from "./helpers/fixtures";
import { signInAs, TRAINER_EMAIL } from "./helpers/auth";
import { disconnect, resetAndSeed, seedSecondClassTypeMonth } from "./helpers/db";
import { pressRNW } from "./helpers/interactions";
import { now } from "../../lib/now";
import { t } from "./helpers/locales";

/**
 * The Reformer lead. The seed already gives them a full month of Reformer
 * sessions; the beforeAll adds the second class type so their month has two
 * buckets to tell apart.
 */
const BASE_PERCENT = 40;
const OVERRIDE_PERCENT = 55;

/**
 * The class type that gets the override. Everything else the trainer holds
 * (the seed's Reformer month) is the control that must stay on the base rate —
 * it is asserted through the default bucket's own label, not by name.
 */
const OVERRIDE_CLASS_TYPE = "Energy pilates";

let trainerUserId: string;
let overrideClassTypeId: string;

/** "55%" etc — what an overridden row and its bucket both render. */
const pct = (n: number) => `${n}%`;

/** Parse "73.500 RSD" (sr-RS grouping) back into a number. */
function parseRsd(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  expect(digits, `expected an RSD amount in ${JSON.stringify(text)}`).not.toBe("");
  return Number(digits);
}

async function openTrainerRates(page: Page) {
  await page.getByTestId("tab-katalog").click();
  await page.getByTestId("katalog-row-treneri").dispatchEvent("click");
  await page.waitForURL(/\/katalog\/treneri$/, { timeout: 10_000 });
  await pressRNW(page.getByTestId(`procenti-trainer-${trainerUserId}`));
  // The per-trainer screen is the one with a base-rate row; waiting on it
  // (rather than the URL alone) also waits out the rates/class-types fetches
  // the rows are derived from.
  await expect(page.getByTestId("procenti-default-row")).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Drive the shared DateTimePicker to a day in the month it already shows.
 *
 * Both sheets seed the picker with `now()`, i.e. the anchor — so the calendar
 * opens on the anchor month and the 1st is one click away, no month paging.
 */
async function pickEffectiveFromFirst(page: Page, triggerTestId: string) {
  await pressRNW(page.getByTestId(triggerTestId));
  const calendar = page.locator('[data-testid="date-time-picker-calendar"]');
  await expect(calendar).toBeVisible({ timeout: 10_000 });
  await calendar
    .locator("button.rdp-day_button", { hasText: /^1$/ })
    .first()
    .dispatchEvent("click");
  await page.getByTestId("date-time-picker-confirm").dispatchEvent("click");
  await expect(calendar).not.toBeVisible({ timeout: 10_000 });
}

/**
 * Read a bucket row as {gross, percent, payout}. The row renders
 * "<name> / <gross> · <percent>%" beside the payout, so all three live in its
 * text.
 *
 * `expectPercent` is not decoration: these reads happen right after a rate
 * write, and the row is on screen with the PREVIOUS month figures until the
 * invalidated month query comes back. Polling until the row states the
 * percentage we just saved is what makes the numbers taken from it the
 * repriced ones rather than a stale snapshot.
 */
async function readBucket(page: Page, key: string, expectPercent: number) {
  const row = page.getByTestId(`payroll-bucket-${key}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(pct(expectPercent), { timeout: 15_000 });

  const text = (await row.innerText()).trim();
  // The payout is the LAST amount on the row; the gross precedes the percent.
  const amounts = text.match(/[\d.]+\s*RSD/g) ?? [];
  expect(
    amounts.length,
    `bucket ${key} should render gross and payout: ${text}`,
  ).toBeGreaterThanOrEqual(2);
  return {
    text,
    gross: parseRsd(amounts[0]!),
    payout: parseRsd(amounts[amounts.length - 1]!),
  };
}

test.describe.serial("per-class-type trainer rate overrides", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    await resetAndSeed();

    // The seed pairs each trainer with ONE class type, so the Reformer lead's
    // month would bucket into a single row and an override would have nothing
    // to be distinguished from. Give them a second class type inside the same
    // month — three finished, consumed sessions, priced like every other.
    const anchor = now();
    const inMonth = (day: number, hour: number) =>
      new Date(anchor.getFullYear(), anchor.getMonth(), day, hour, 0, 0, 0);
    const seeded = await seedSecondClassTypeMonth({
      trainerEmail: TRAINER_EMAIL,
      classTypeName: OVERRIDE_CLASS_TYPE,
      // Early in the month and safely before the anchor, so payroll counts
      // them as already held.
      startsAt: [inMonth(4, 12), inMonth(5, 12), inMonth(6, 12)],
    });
    trainerUserId = seeded.trainerUserId;
    overrideClassTypeId = seeded.classTypeId;

    // Warm the Expo web bundle once — the first navigation triggers a lazy
    // Metro compile that can outlast a single test's budget.
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

  test("an override backdated to the 1st reprices only its own class type, and the payout is the sum of the buckets", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAs(page, "admin");
    await openTrainerRates(page);

    // Before: every class type inherits, shown as "40% (osnovni)" and dimmed,
    // so an inherited figure is never mistaken for a negotiated one.
    const inheritedLabel = t.payroll.inheritedPercent.replace(
      "{{percent}}",
      String(BASE_PERCENT),
    );
    await expect(
      page.getByTestId(`procenti-class-type-row-${overrideClassTypeId}`),
    ).toContainText(inheritedLabel);
    // And with nothing overridden yet there is no revert affordance at all.
    await expect(
      page.getByTestId(`procenti-revert-${overrideClassTypeId}`),
    ).toHaveCount(0);

    // Opening the sheet FROM the class-type row is what scopes the write; the
    // same sheet opened from the base row would move the trainer's default.
    await pressRNW(
      page.getByTestId(`procenti-class-type-row-${overrideClassTypeId}`),
    );
    await expect(page.getByTestId("procenti-percent-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("procenti-percent-input").fill(String(OVERRIDE_PERCENT));

    // Backdated to the 1st ON PURPOSE: rates resolve at month start, so an
    // override effective today would leave the running month untouched and
    // this spec would assert nothing.
    await pickEffectiveFromFirst(page, "procenti-effective-from");
    await page.getByTestId("procenti-note-input").fill("Individualni termini");
    await pressRNW(page.getByTestId("procenti-save"));

    // The row now states the negotiated percent plainly, unqualified.
    const overriddenRow = page.getByTestId(
      `procenti-class-type-row-${overrideClassTypeId}`,
    );
    await expect(overriddenRow).toContainText(pct(OVERRIDE_PERCENT), {
      timeout: 15_000,
    });
    await expect(overriddenRow).not.toContainText(inheritedLabel);
    // The base rate itself is untouched — this was a scoped write.
    await expect(page.getByTestId("procenti-default-value")).toHaveText(
      pct(BASE_PERCENT),
    );

    // Honorari: the month now splits into the overridden class type and the
    // default bucket that everything else falls into.
    await page.goto(`/izvestaji/honorari/${trainerUserId}`);

    const override = await readBucket(
      page,
      overrideClassTypeId,
      OVERRIDE_PERCENT,
    );
    const fallback = await readBucket(page, "default", BASE_PERCENT);

    // Each bucket names itself, and only the overridden one moved.
    expect(override.text).toContain(OVERRIDE_CLASS_TYPE);
    expect(fallback.text).toContain(t.payroll.defaultBucket);

    // The arithmetic the admin is reading actually holds, per bucket.
    expect(override.payout).toBe(
      Math.round((override.gross * OVERRIDE_PERCENT) / 100),
    );
    expect(fallback.payout).toBe(
      Math.round((fallback.gross * BASE_PERCENT) / 100),
    );

    // And the hero equals the SUM of the rows beneath it. The server rounds
    // each bucket rather than the total, so a hero derived any other way
    // would drift from the visible breakdown — the regression this pins.
    const hero = parseRsd(
      await page.getByTestId("honorari-detail-payout").innerText(),
    );
    expect(hero).toBe(override.payout + fallback.payout);

    // The override is worth more than the base rate on the same money, which
    // is the whole point of having set it.
    expect(override.payout).toBeGreaterThan(
      Math.round((override.gross * BASE_PERCENT) / 100),
    );
  });

  test("the trainer sees the same split on Moja zarada", async ({ page }) => {
    test.setTimeout(120_000);
    // The trainer never sends a trainer id — the server derives it from the
    // session — so this is the same month computed by a different path.
    await signInAs(page, "trainer");
    await page.getByTestId("tab-zarada").click();

    const override = await readBucket(
      page,
      overrideClassTypeId,
      OVERRIDE_PERCENT,
    );
    const fallback = await readBucket(page, "default", BASE_PERCENT);

    expect(override.text).toContain(OVERRIDE_CLASS_TYPE);
    expect(fallback.text).toContain(t.payroll.defaultBucket);

    const hero = parseRsd(await page.getByTestId("zarada-payout").innerText());
    expect(hero).toBe(override.payout + fallback.payout);
  });

  test("the roster row flags that the trainer has a special rate", async ({
    page,
  }) => {
    await signInAs(page, "admin");
    await page.getByTestId("tab-katalog").click();
    await page.getByTestId("katalog-row-treneri").dispatchEvent("click");
    await page.waitForURL(/\/katalog\/treneri$/, { timeout: 10_000 });

    // The row can't show every per-class-type figure, so it says how many
    // there are; the screen behind it says what they are.
    await expect(
      page.getByTestId(`procenti-overrides-hint-${trainerUserId}`),
    ).toHaveText(t.payroll.overridesHint.replace("{{count}}", "1"), {
      timeout: 15_000,
    });
    // The headline number stays the BASE rate — the overrides are the
    // exception, not the trainer's rate.
    await expect(page.getByTestId(`procenti-value-${trainerUserId}`)).toHaveText(
      pct(BASE_PERCENT),
    );
  });

  test("reverting tombstones the override: the row inherits again and the bucket folds back", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAs(page, "admin");
    await openTrainerRates(page);

    // Ending an override is a dated decision, not a formality — the confirm
    // step asks for the date, and it is backdated to the 1st so the running
    // month is handed back too.
    await pressRNW(page.getByTestId(`procenti-revert-${overrideClassTypeId}`));
    await expect(page.getByTestId("procenti-revert-confirm")).toBeVisible({
      timeout: 10_000,
    });
    await pickEffectiveFromFirst(page, "procenti-revert-effective-from");
    await pressRNW(page.getByTestId("procenti-revert-confirm"));

    // Back to inherited: dimmed, qualified, and with no revert affordance
    // left to press.
    const revertedRow = page.getByTestId(
      `procenti-class-type-row-${overrideClassTypeId}`,
    );
    await expect(revertedRow).toContainText(
      t.payroll.inheritedPercent.replace("{{percent}}", String(BASE_PERCENT)),
      { timeout: 15_000 },
    );
    await expect(
      page.getByTestId(`procenti-revert-${overrideClassTypeId}`),
    ).toHaveCount(0);

    // The roster stops advertising a special rate.
    await page.goto("/katalog/treneri");
    await expect(page.getByTestId(`procenti-value-${trainerUserId}`)).toHaveText(
      pct(BASE_PERCENT),
      { timeout: 15_000 },
    );
    await expect(
      page.getByTestId(`procenti-overrides-hint-${trainerUserId}`),
    ).toHaveCount(0);

    // Honorari folds back to ONE bucket: a tombstoned class type has been
    // handed to the default, so it must not keep a row of its own.
    await page.goto(`/izvestaji/honorari/${trainerUserId}`);
    const fallback = await readBucket(page, "default", BASE_PERCENT);
    expect(fallback.text).toContain(t.payroll.defaultBucket);
    await expect(
      page.getByTestId(`payroll-bucket-${overrideClassTypeId}`),
    ).toHaveCount(0);

    // Everything the trainer held is now paid at the one rate, and the hero
    // still equals the single row beneath it.
    expect(fallback.payout).toBe(
      Math.round((fallback.gross * BASE_PERCENT) / 100),
    );
    const hero = parseRsd(
      await page.getByTestId("honorari-detail-payout").innerText(),
    );
    expect(hero).toBe(fallback.payout);
  });
});
