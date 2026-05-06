# Project Instructions

Baza Pilates — Expo monorepo, three roles (Admin / Trainer / Client), iOS + Android + Web from one codebase with server-side API routes.

## Stack

| Concern | Choice |
|---|---|
| **Framework** | Expo Router 6, file-based routing |
| **Styling** | Tamagui + Uniwind `className`. Theme: bone canvas `#fdf7f4`, ink text, forest-green `#2e5b42` as brand signature only, black as primary CTA |
| **State** | TanStack Query for server state. Query factories in `lib/queries/` returning `queryOptions()` |
| **Validation** | Zod schemas in `packages/types/` (`@baza/types`), shared client/server |
| **Database** | Prisma + PostgreSQL (port 5434). Schema at `apps/mobile/prisma/schema.prisma` |
| **Auth** | Better Auth, session cookies, invite-only |
| **i18n** | Serbian (default) and English in `apps/mobile/locales/{sr,en}.json` |
| **Email** | React Email templates in `apps/mobile/emails/`, sent via Resend |
| **Package manager** | `pnpm` only — never npm or yarn |

## Layout

- `apps/mobile/` — Expo app + API routes
  - `app/(admin)/`, `app/(trainer)/`, `app/(client)/` — role-scoped screens
  - `app/api/` — server route handlers
  - `lib/server/` — server-only modules (Prisma client, auth guards, notifications)
  - `lib/queries/` — TanStack query factories
  - `components/ui/` — shared UI (`Button`, `GlassCard`, `WeekStrip`, `SessionCard`, …)
  - `components/ui/studio/` — Studio visual system primitives
  - `test/e2e/` — Playwright web E2E
  - `test/integration/` — Vitest with real Postgres
  - `test/unit/` — Vitest, no DB
- `packages/types/` — shared Zod schemas
- `packages/i18n/` — shared i18n utilities

## Studio Visual System

- **Use Uniwind `className` for colors, layout, type.** Reach for inline `style` only for off-scale sizes, letter-spacing, line-height, computed values, or native props that need a JS color (Feather `color`, `placeholderTextColor`). If utilities seem broken after a token change, bounce Metro with `--clear`.
- **Every visible string must be i18n'd in BOTH `locales/sr.json` AND `locales/en.json`.** Serbian is default. Includes accessibility labels (`common.a11y*` namespace).
- **No `useEffect` for one-shot setup** like setting a status bar style. Use the declarative form; if a parent overrides it, fix the parent.

## Server-Side Patterns

- Auth: `requireAuth()` / `requireRole()` from `lib/server/auth-guards.ts`.
- Trainer-scoping: `lib/server/trainer-scope.ts` (`trainerLinkedToClientProfile`, `trainerOwnsSession`). Reuse — don't reinvent.
- Notifications: `lib/server/notifications.ts` (push via Expo, persisted in-app).
- Cron jobs: POST with `x-cron-token` header, support `dryRun` and `mode` params.
- API contract is documented in `docs/api-contract.md` — keep it current when you add or change routes.

## Database Changes

1. Edit `apps/mobile/prisma/schema.prisma`.
2. `pnpm --filter mobile exec prisma migrate dev --name <name>`.
3. `pnpm --filter mobile exec prisma generate`.
4. Update Zod schemas in `packages/types/` if shape changed.

**Never** `prisma db push` — even on test DBs. Use `migrate dev` / `migrate deploy` / `migrate reset`. Mocked or "just push for now" schemas have masked migration bugs in the past.

## Testing Conventions

Testing Trophy — prioritize integration > unit. Tests must reflect real behavior, not implementation details.

### What goes where

| Layer | Tool | What lives here |
|---|---|---|
| **E2E** | Playwright (Chromium, web) | User journeys end-to-end against a real dev server + real Postgres. `apps/mobile/test/e2e/*.spec.ts`. Run: `pnpm --filter mobile test:e2e` |
| **Integration** | Vitest + real Postgres | API route handlers invoked directly with mocked auth via `auth-mock`, hitting the real test DB. `apps/mobile/test/integration/*.test.ts`. Run: `pnpm --filter mobile test:integration` |
| **Unit** | Vitest, no DB | Pure logic complex enough to warrant isolation (date math, eligibility calculations). `apps/mobile/test/unit/*.test.ts`. Run: `pnpm --filter mobile test:unit` |

### Test data

- E2E: each spec file's `beforeAll` reseeds via `scripts/test/seed-e2e.ts`. State is shared **within** a file across tests in order — be careful when one spec mutates data another reads.
- Integration: `setup-db.ts` truncates between tests. Auth is mocked at `@/lib/server/auth-guards` so tests `setMockUser({ id, role, ... })` and call route handlers directly.
- Helpers: `apps/mobile/test/e2e/helpers/db.ts` for DB-direct seed extensions (linkage, past sessions, attendance, fillers). `helpers/dates.ts` for deterministic date pickers and `navigateWeekStripTo()`.

### Avoiding flaky tests

- **Wait for state, not time.** Use `expect.poll()`, `waitFor({ state: 'visible' })`, `findBy*`. Never `setTimeout`/`sleep`/`waitForTimeout` as a primary wait — only as a fallback inside a condition-based polling loop.
- **No racy date math.** Patterns like `if (d.getTime() === Date.now())` compare two timestamps from the same instruction stream and resolve differently across runs. Use a deterministic iteration counter (see `helpers/dates.ts:nextReformerDayKey`).
- **WeekStrip-driven specs must navigate.** The schedule renders 7 days from a local `weekStart` state. If the spec gets a date from the DB (`findFutureSeriesSession`) and that date isn't in the visible week, `[data-testid="week-strip-day-${date}"]:visible` will never resolve. Use `helpers/dates.ts:navigateWeekStripTo(page, dateKey)` — it pages prev/next chevrons until the target is visible.
- **Each test passes in isolation OR documents its dependencies.** If a test relies on prior-test mutations, the file's `beforeAll` should set them up — don't lean on test ordering across files.
- **Assert on UI state, not request URLs** unless the action is fire-and-forget with no visible result.
- **testIDs are the contract.** Convention: `<context>-<element>` (e.g. `client-row-${id}`, `package-create-submit`). Components that needed it (`Button`, `Select`, `Input`, `ConfirmSheet`, `SessionCard`, `SegmentedControl`, `MetricRow`, `ErrorState`, `DateTimePicker`) accept and forward a `testID` prop — keep doing this for new components.

### Date handling — known fragility

The whole suite reads the **wall clock**: the seed creates 2 weeks of recurring sessions starting from "today's locale week", APIs filter `gt: new Date()`, helpers like `findFutureSeriesSession` filter on real `now`, many specs compute target dates from `new Date()`. This works today but drifts:

- **Day-of-week sensitivity** — Reformer is Mon/Wed/Fri, so Saturday runs see different visible-week sessions than Wednesday runs.
- **Time-of-day sensitivity** — the seed skips sessions whose `startsAt` is already past at seed time.
- **Cross-spec mutation** — a spec that cancels a session shifts every downstream "next future session" lookup.

The proper fix is anchor-time: pin every layer (seed, server, browser, helpers) to a fixed instant via an `E2E_NOW` env var + Playwright `page.clock.setFixedTime()`. Tracked in `docs/test-plan.md` under "Known fragility — anchor-time follow-up". **Until that lands, when you write a spec that touches dates, use the `helpers/dates.ts` helpers and check that the spec stays green if you run it as-of next Saturday.**

### Gotchas

- **Maestro is deferred** — Phase B follow-up. Do not add Maestro flows now; the snapshot in `/tmp/baza-tests-snapshot/` and old commits (`974188f`, `f5a4bec`, `22dadfa`) preserve the working setup for later.
- **`page.clock.install()` only freezes the browser**, not the Node dev server. The dev server's `Date` keeps moving — be aware when faking time.
- **Fresh page per Playwright test**: state isolation is at the page level, not the worker level.

## Adding a route

1. Create the route file in `apps/mobile/app/api/`.
2. Export async `GET` / `POST` / `PATCH` / `DELETE` handlers.
3. Wrap with `requireAuth()` / `requireRole()`.
4. Validate request bodies with Zod from `@baza/types`.
5. Add an integration test in `test/integration/` covering happy path + at least one auth-failure path.
6. Update `docs/api-contract.md`.

## Adding a translation

1. Add keys to BOTH `locales/sr.json` AND `locales/en.json` — never one without the other.
2. Use `useTranslation()` in components.
3. Keep key structure consistent across languages (same nesting, same plural keys).

## Commands

```bash
# Setup
pnpm install
docker compose up -d                               # PostgreSQL on port 5434
pnpm --filter mobile exec prisma migrate dev

# Dev
pnpm dev                                           # Expo dev server, port 8010

# Quality
pnpm lint                                          # oxlint via turbo
pnpm --filter mobile check-types                   # tsc --noEmit
pnpm format:check

# Tests
pnpm --filter mobile test:unit
pnpm --filter mobile test:integration
pnpm --filter mobile test:e2e
pnpm --filter mobile test:e2e -g "51:"             # one spec by name fragment
```

## Deployment

- Mobile: EAS Build + EAS Update
- Server/Web: EAS Hosting
- DB: Neon Postgres

See `docs/deployment-runbook.md` for production procedures.

## Worktrees

When working in a git worktree, ALL file operations — reads, searches, edits, subagent prompts — must use the worktree path. Never `cd` into or reference the main checkout. The worktree already has the same code; there is no reason to go to the main tree.
