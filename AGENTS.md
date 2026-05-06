# Project Instructions

Baza Pilates — Expo monorepo. Three roles: Admin / Trainer / Client.

## Stack

| Concern | Choice |
|---|---|
| Framework | Expo Router 6 |
| Styling | Tamagui + Uniwind `className`. Theme: bone `#fdf7f4`, ink, brand `#2e5b42`, CTA black |
| State | TanStack Query — factories in `lib/queries/` returning `queryOptions()` |
| Validation | Zod in `packages/types/` (`@baza/types`) |
| DB | Prisma + Postgres |
| Auth | Better Auth, session cookies, invite-only |
| i18n | Serbian (default) + English in `apps/mobile/locales/{sr,en}.json` |
| Package manager | pnpm — never npm/yarn |

## Rules

- Use `pnpm` scripts from `package.json`. Don't invent commands. Don't run raw `tsc`/`vitest`/`playwright` directly — go through the script (e.g. `pnpm --filter mobile test:e2e`).
- Studio visual system: `className` for colors/layout/type. Inline `style` only for off-scale sizes, letter-spacing, or native props that need a JS color.
- Every visible string in BOTH `locales/sr.json` AND `locales/en.json`. Includes a11y labels.
- No `useEffect` for one-shot setup.
- Reuse server helpers — `requireAuth`/`requireRole` (`lib/server/auth-guards.ts`), trainer-scope (`lib/server/trainer-scope.ts`).
- Schema changes via `prisma migrate dev` / `migrate deploy` / `migrate reset`. **Never** `prisma db push`, even on test DBs.

## Testing

Testing Trophy — integration > unit. Real DB, real route handlers.

| Layer | Tool | Path |
|---|---|---|
| E2E | Playwright (Chromium, web) | `apps/mobile/test/e2e/` |
| Integration | Vitest + real Postgres | `apps/mobile/test/integration/` |
| Unit | Vitest | `apps/mobile/test/unit/` |

Anti-flake rules:

- Wait for state, not time. `expect.poll()` / `waitFor({ state: "visible" })` / `findBy*`. No `setTimeout` or `waitForTimeout` as a primary wait.
- No racy date math. `d.getTime() === Date.now()` resolves differently across runs — use a deterministic iteration counter (see `test/e2e/helpers/dates.ts`).
- WeekStrip-driven specs must navigate. Use `helpers/dates.ts:navigateWeekStripTo(page, dateKey)` — don't assume the target date is in the visible week.
- `testID` convention: `<context>-<element>` (e.g. `client-row-${id}`).
- Each test passes in isolation, or the file's `beforeAll` sets up its dependencies.

Date handling fragility: the suite reads the wall clock (seed window + `gt: new Date()` filters + `new Date()` in spec code). It drifts by day-of-week, time-of-day, and cross-spec mutation. Anchor-time refactor is tracked in `docs/test-plan.md` — until it lands, sanity-check that any new date-touching spec stays green if run as-of next Saturday.

`page.clock.install()` only freezes the browser. The dev server's Node `Date` keeps moving.

## Worktrees

When working in a git worktree, ALL operations use the worktree path. Never `cd` into or reference the main checkout.
