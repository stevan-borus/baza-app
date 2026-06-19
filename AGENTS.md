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

### Before opening a PR

CI only runs the fast DB-free gate (lint + types + unit). Integration and e2e
need a real Postgres and take ~40min over a remote DB, so **they do NOT run in
CI** — you run them locally first, against localhost Postgres (~1-2min). Do this
before opening or updating a PR:

```sh
# 1. Start the local test Postgres (once per session)
docker compose up -d

# 2. From apps/mobile — the fast gate (also what CI runs):
pnpm lint && pnpm check-types && pnpm test:unit

# 3. Integration (resets+migrates baza_app_test, then runs the suite):
pnpm test:db:prepare && pnpm test:integration

# 4. E2E (full prepare chain: bootstrap + reset + patch + rich-seed, then run):
pnpm test:e2e:prepare && pnpm test:e2e
```

All four must pass before the PR goes up. If any integration/e2e spec fails,
fix it — a green PR check does **not** cover these, so a broken spec will only
surface here. (This is the drift the project kept hitting when these suites had
no gate at all.)

Anti-flake:

- Wait for state, not time. `expect.poll()` / `waitFor({ state: "visible" })` / `findBy*`. No `setTimeout` / `waitForTimeout` as a primary wait.
- No racy date math. `d.getTime() === Date.now()` resolves differently across runs — use a deterministic iteration counter (see `test/e2e/helpers/dates.ts`).
- WeekStrip-driven specs must navigate. Use `helpers/dates.ts:navigateWeekStripTo(page, dateKey)` — don't assume the target date is in the visible week.
- Each test passes in isolation, or the file's `beforeAll` sets up its dependencies.
- `testID` convention: `<context>-<element>` (e.g. `client-row-${id}`).
- Date-touching code: import `now()` / `nowMs()` from `@/lib/now` instead of calling `new Date()` / `Date.now()` whenever the value semantically means "current time". The test stack pins those helpers to a fixed instant via `TEST_ANCHOR_TIME` — see CONTEXT.md → "Anchor time".

## Worktrees

When working in a git worktree, ALL operations use the worktree path. Never `cd` into or reference the main checkout.
