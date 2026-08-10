# HANDOFF — Trainer payroll (`t3code/trainer-payout-report`)

**Worktree**: `/Users/stevanborus/.t3/worktrees/baza-app/t3code-76936f20`
**Branch**: `t3code/trainer-payout-report` @ `a027f6d`, merged with `origin/dev` @ `b78657d`
**PR**: https://github.com/stevan-borus/baza-app/pull/139 (open, targets `dev`)
**Resume here**: the follow-up below (admin trainer invites) is the next piece of work.
The payroll feature itself is complete and green — it needs review + data entry, not code.

## ⏭ Next task: admins can't invite trainers

`POST /api/invites` hardcodes `role: UserRole.CLIENT` (`server/routes/invites.ts:73`), and
the invite sheet has no role control. Trainers only exist via `scripts/seed.ts` or direct
DB writes — that is how the 3 on staging were made.

This is pre-existing, not a regression from #139, but it became the obvious gap once
trainers got their own screens (Zarada tab) and their own rates (Katalog → Procenti
trenera): the studio can now pay a trainer it has no way to onboard.

Rough shape:

- `createInviteInputSchema` gains an optional `role` (CLIENT | TRAINER; **never ADMIN**
  from this path — admin creation should stay deliberate/out-of-band).
- Route honours it, ADMIN-only for anything but CLIENT (a trainer must not be able to
  mint another trainer).
- `UserInvite.role` already exists on the model and `accept-invite` already reads it, so
  the redemption path likely needs no change — **verify this rather than assuming**.
- Invite sheet gets a role selector; the clients list is client-scoped, so a trainer
  invite probably belongs in the same place admins manage staff.
- i18n in BOTH `locales/sr.json` and `locales/en.json`.
- Tests: integration (role honoured, trainer-can't-invite-trainer, redemption lands the
  right role), plus a component test if the sheet gains real branch logic.

Open question for the owner: should a TRAINER invite collect the same fields as a client
(date of birth, phone) or a reduced set? The current form is client-shaped.

## What shipped in #139 (9 commits, all verified)

**The formula** — `price / (sessionsGranted + bonusSessions)` per attendee, summed per
session, × the trainer's flat percent. The owner's worked example is the unit test:
2× (15.000/12) + 1× (11.000/8) = **3.875 RSD**. Charged no-shows count (the package was
consumed, so the work is owed). Calendar month, Belgrade, aligned to the 05:00 studio day.

**Gifts became a flag, not a SKU** — the load-bearing decision. Gift SKUs were unpriced
1-session rows, so a gifted session was worth 0 and the trainer would be paid nothing.
Inferring a price was arbitrary (a class type is served by several packages at different
rates). Now `isGift` on `ClientPackage` keeps the REAL priced package and grants 1 session
by default. `sessionsGranted` snapshots the granted count so a 1-session gift on a
12-session SKU doesn't render "1/12"; `lib/package-total.ts` is now the single place the
"y" in "x/y" is computed.

**Locking** — a `PayrollPeriod` snapshots every attendee line on lock, so editing a
package price or revoking a package can't rewrite an already-paid month. Tested by doing
exactly that. Unlock is allowed (month one will need corrections) and discards the
snapshot. Rates are append-only history for the same reason.

### Files worth knowing

| Path | Why |
|---|---|
| `lib/payroll-valuation.ts` | Pure money rule + Belgrade month range. No DB. |
| `lib/server/payroll.ts` | Attendance rule (which bookings count) + month rollup. |
| `lib/server/payroll-period.ts` | OPEN = live compute, LOCKED = frozen lines. |
| `server/routes/payroll/*` | month, summary, rates, lock, adjustments. |
| `app/(admin)/izvestaji/honorari/` | Owner's view + per-trainer drill-down. |
| `app/(admin)/katalog/procenti-trenera.tsx` | Set a trainer's percentage. |
| `app/(trainer)/zarada.tsx` | Trainer's own month only. |

### Authorization (do not weaken)

PR #123 stripped TRAINER from studio-wide report routes because they leaked other
trainers' figures. Same boundary here: `/api/payroll/month` takes the trainer id from the
**session**, never the query string, for a TRAINER caller; `/summary` and `/rates` are
ADMIN-only. A trainer sees their own earnings total but not the percentage behind it.
Integration tests assert the cross-tenant denials.

## Before merging #139

1. **Enter trainer percentages** — Katalog → Procenti trenera. No rate ⇒ payout 0 and
   locking is refused. This is data entry only the owner can do.
2. **Review the 3 data migrations** (below) — one rewrites 10 existing gift packages.

## Migrations this branch adds (order matters)

1. `20260810192948_client_package_gift_and_granted_sessions` — `isGift` + `sessionsGranted`,
   backfilled from each row's own `sessionCount`. Existing totals unchanged.
2. `20260810194259_trainer_payroll` — `TrainerRate`, `PayrollPeriod`, `PayrollLine`,
   `PayrollAdjustment`, `PayrollPeriodStatus`.
3. `20260810195709_remap_legacy_gift_packages` — repoints the 10 legacy gifts onto the
   most-bought priced package for their class type. **Dry-run on staging: all 10 → Reformer
   12 (1.250/session). None has a booking, so no historical figure moves.**
4. `20260810204317_price_nadoknada_packages` — prices the 2 make-up SKUs (0 assignments).

Both data migrations pick the reference by "most-bought package sharing the class type",
NOT cheapest (which valued a Reformer gift at the Energy rate) and NOT most-expensive
(which valued a group session at the personal-training rate). Both have integration tests
that re-run the shipped SQL against seeded fixtures, including those traps.

## Verification status (as of handoff)

- `pnpm lint` 0 errors (27 pre-existing warnings) · `pnpm check-types` clean
- `pnpm test:unit` 680 · `pnpm test:component` 161 · `pnpm test:integration` 706
- `pnpm test:e2e` 120 passed / 1 skipped

`test/e2e/admin-write-splices.spec.ts` is **flaky, not broken by this branch** — verified by
checking out `origin/dev` and running it there, where it failed a *different* test in the
same file. It passes 6/6 on this branch on re-run.

## Traps hit while building this (don't re-learn them)

- **Never overlap runs on `baza_app_test`.** Killing the e2e suite mid-run left the DB in a
  state that made an unrelated billing test fail. It passed clean on re-run. Match the
  project memory on this.
- **`now()` reads `TEST_ANCHOR_TIME`, not `vi.setSystemTime`.** Server-side date logic in
  integration tests must set the env var (see `test/integration/payroll-month.test.ts`).
- **`toISOString().slice(0,10)` is a timezone bug** for date-only values — it converts to
  UTC first, so a date picked before 02:00 Belgrade sends the previous day. Use
  `dayjs(d).format("YYYY-MM-DD")`; the rates route rejects anything that isn't a plain
  calendar date.
- **`expo customize tsconfig.json`** regenerates `.expo/types/router.d.ts` after adding a
  route; without it `check-types` fails on the new path. Checking out another branch stales
  it again.
- **The gift model change touched more surfaces than its first commit.** The assign sheet,
  the birthday push, and the notification preselection all still read the retired
  `packageType.isBirthdayGift` afterwards — two were real user-facing bugs caught only by
  e2e (a birthday gift sent the flat "package assigned" push). If you touch the gift model
  again, grep for `isBirthdayGift` across `app/`, `components/`, `lib/`, `server/`.
- **The e2e seed had no package prices** until this branch; payout assertions there would
  have silently read 0. It now seeds the real catalog prices.

## Open product questions

- Should a trainer see the percentage behind their own earnings, or only the total?
  (Currently: only the total.)
- Route names are Serbian (`honorari`, `zarada`, `procenti-trenera`) matching the existing
  ~19 routes. Owner asked why files are Serbian — answer: only URL segments are, all code
  is English. If English URLs are wanted it's a repo-wide rename, its own PR.
- `Nadoknada` make-up SKUs are now priced, but gifting a real package covers the same need.
  Worth deciding whether they get retired too.
