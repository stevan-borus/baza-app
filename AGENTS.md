# Project Instructions

## Tooling

- pnpm only — never npm/yarn.
- Run scripts from `package.json`. Don't invoke `tsc`, `vitest`, `playwright`, `prisma` directly — go through the script (e.g. `pnpm --filter mobile test:e2e`, `pnpm --filter mobile check-types`).
- Schema changes: `prisma migrate dev` / `migrate deploy` / `migrate reset`. **Never** `prisma db push`, even on test DBs.

## i18n

Every visible string lives in BOTH `apps/mobile/locales/sr.json` AND `apps/mobile/locales/en.json`. Includes a11y labels. Serbian is default.

## Testing

Testing Trophy — integration > unit. Real DB, real route handlers, real Playwright dev server.

| Layer | Tool | Path |
|---|---|---|
| E2E | Playwright (Chromium, web) | `apps/mobile/test/e2e/` |
| Integration | Vitest + real Postgres | `apps/mobile/test/integration/` |
| Unit | Vitest | `apps/mobile/test/unit/` |

Anti-flake:

- Wait for state, not time. `expect.poll()` / `waitFor({ state: "visible" })` / `findBy*`. No `setTimeout` / `waitForTimeout` as a primary wait.
- No racy date math. `d.getTime() === Date.now()` resolves differently across runs — use a deterministic iteration counter (see `test/e2e/helpers/dates.ts`).
- WeekStrip-driven specs must navigate. Use `helpers/dates.ts:navigateWeekStripTo(page, dateKey)` — don't assume the target date is in the visible week.
- Each test passes in isolation, or the file's `beforeAll` sets up its dependencies.
- `testID` convention: `<context>-<element>` (e.g. `client-row-${id}`).

Date fragility: the suite reads the wall clock (seed window + `gt: new Date()` filters + `new Date()` in spec code). It drifts by day-of-week, time-of-day, and cross-spec mutation. Anchor-time refactor tracked in `docs/test-plan.md`. Until it lands, sanity-check that any new date-touching spec stays green if run as-of next Saturday. `page.clock.install()` only freezes the browser, not the Node dev server.

## Worktrees

When working in a git worktree, ALL operations use the worktree path. Never `cd` into or reference the main checkout.
