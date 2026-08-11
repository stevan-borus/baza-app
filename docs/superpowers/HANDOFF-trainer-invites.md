# HANDOFF — Let admins invite trainers

**Next task.** Payroll (#139) is merged; this is the gap it exposed.

## The problem

`POST /api/invites` hardcodes `role: UserRole.CLIENT` (`server/routes/invites.ts:73`),
and the invite sheet has no role control. Trainers only exist via `scripts/seed.ts` or
direct DB writes — that is how the three on staging were made.

Pre-existing, not a regression from #139. It became the obvious next gap once trainers
got their own screens (Zarada tab) and their own commission rates (Katalog → Procenti
trenera): the studio can now pay a trainer it has no way to onboard.

## Shape of the work

- `createInviteInputSchema` gains an optional `role` (`CLIENT | TRAINER`). **Never
  `ADMIN` from this path** — admin creation should stay deliberate and out-of-band.
- The route honours it, ADMIN-only for anything but `CLIENT`. A trainer must not be able
  to mint another trainer.
- `UserInvite.role` already exists on the model and `accept-invite` appears to read it,
  so redemption may need no change — **verify that rather than trusting this note.**
- The invite sheet needs a role selector. The Klijenti list is client-scoped, so a
  trainer invite probably belongs wherever admins manage staff, not in the client list.
- i18n in BOTH `locales/sr.json` and `locales/en.json`, a11y labels included.
- Tests: integration (role honoured; trainer-can't-invite-trainer; redemption lands the
  right role), plus a component test if the sheet grows real branch logic.

**Open question for the owner:** should a TRAINER invite collect the same fields as a
client (date of birth, phone) or a reduced set? The current form is client-shaped.

## Traps worth knowing (all cost time on #139)

- **New lucide icon → also add it to `test/component/stubs/lucide-react-native.tsx`.**
  The component layer stubs the package wholesale; a missing export fails 17 test files
  at import. The suite still reports "passing" — just far fewer tests (161 → 36), so
  watch the count, not the exit line.
- **`now()` reads `TEST_ANCHOR_TIME`, not `vi.setSystemTime`.** Server-side date logic in
  integration tests must set the env var.
- **`toISOString().slice(0,10)` is a timezone bug** for date-only values — it converts to
  UTC first, so a date picked before 02:00 Belgrade sends the previous day. Use
  `dayjs(d).format("YYYY-MM-DD")`.
- **`expo customize tsconfig.json`** regenerates `.expo/types/router.d.ts` after adding a
  route; without it `check-types` fails on the new path. Checking out another branch
  stales it again.
- **Never overlap runs on `baza_app_test`.** Killing an e2e run mid-flight left the DB in
  a state that failed an unrelated billing test on the next run.
- **Two e2e specs fail on `dev` itself** — `trainer-clients-sticky-header` and a rotating
  birthday-gift spec. `seedExtraTrainerLinkedClients` mutates shared state with no
  cleanup, so the failure moves around. Not yours; worth fixing separately.

## Where payroll ended up (context for the next change)

Not the design the first spec described. The owner rejected the "Zaključaj mesec" button
because it depended on an admin remembering to press it, so **each payout line now
freezes at consumption**: the cron writes value + client name + package name + gift flag
onto `SessionConsumption`. The report reads snapshots and computes live only for sessions
the cron hasn't reached (a few hours). `PayrollPeriod`, `PayrollLine` and the lock route
no longer exist. Adjustments stayed, keyed to trainer + month.

Gifts are a flag (`ClientPackage.isGift`) on a REAL priced package, not a separate SKU —
that is what makes a gifted session worth paying a trainer for.

| Path | Why |
|---|---|
| `lib/payroll-valuation.ts` | Pure money rule + Belgrade month range. No DB. |
| `lib/server/payroll.ts` | Attendance rule, snapshot-vs-live merge, month rollup. |
| `server/routes/payroll/*` | month, summary, rates, adjustments. |
| `app/(admin)/izvestaji/honorari/` | Owner's view, per-trainer drill-down, session detail. |
| `app/(admin)/katalog/procenti-trenera.tsx` | Set a trainer's percentage. |
| `app/(trainer)/zarada.tsx` | Trainer's own month — same breakdown the admin sees. |

**Authorization (do not weaken):** PR #123 stripped TRAINER from studio-wide report routes
because they leaked other trainers' figures. Same boundary here: `/api/payroll/month`
takes the trainer id from the **session** for a TRAINER caller, never the query string;
`/summary` and `/rates` are ADMIN-only. Integration tests assert the cross-tenant denials.

## Staging, after deploying #139

Data there is seed/mock and disposable. Deploy (six migrations run), reseed, then set each
trainer's percentage in Katalog → Procenti trenera — with an effective-from date at or
before the month you want covered. Without a rate every payout reads 0 by design; there is
no invented default.

To fill historical snapshots after a deploy, one manual cron call walks back a year:
`POST /api/cron/sessions/consumption?mode=immediate&lookbackHours=8760` (needs the cron
auth header). The scheduled run only looks back 30 hours.
