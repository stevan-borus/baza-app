# HANDOFF — Mix-and-match packages (`feat/mix-packages`)

**Worktree**: `.claude/worktrees/feat/mix-packages` (branch `feat/mix-packages`, rebased onto `origin/dev` @ `5e7011e`).
**Resume here**: the FIRST action tomorrow is the consent step below — everything else is unblocked after it.

## ⏭ Immediate next step (blocked on user consent)

Integration tests need the test DB reset. Prisma's AI-agent gate requires the user's
explicit consent message passed verbatim:

```sh
cd apps/mobile   # inside the worktree
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<user's exact consent message>" pnpm test:db:prepare
pnpm test:integration
```

Target is `postgresql://localhost:5434/baza_app_test` (hardcoded in the script) — the
disposable local test DB, NOT dev/staging. User said they'll consent at session start.

## What this feature is (decisions all recorded)

- **ADR**: `docs/adr/0010-mix-packages-shared-pool.md` — shared pool (no per-type quotas),
  spend priority = narrowest ClassType set first, then soonest effective expiry.
- **CONTEXT.md** updated: new **Mix package** term, set-scoped PackageType/ClientPackage,
  campaign-audience set membership, fixed example dialogue.
- API contract: PackageType speaks `classTypeIds: string[]` (input) / `classTypes: [{id, name}]`
  (responses); ClientPackage responses carry `classTypes: [{id, name}]`, POST response `classTypeIds`.
- Birthday suggestion: single-type active pack suggests as before; a mix pack falls through
  to the most-recent-booking heuristic.

## State: DONE (committed on this branch)

1. **Eligibility** (`lib/server/package-eligibility.ts`): `EligibilityPackage.classTypeIds`,
   set membership, narrowest-first + soonest-expiry sort, `ELIGIBILITY_PACKAGE_SELECT` +
   `toEligibilityPackage` helpers. Unit suite green **636/636**.
2. **Schema**: `PackageTypeClassType` + `ClientPackageClassType` join tables
   (`onDelete: Restrict` from ClassType), scalar `classTypeId` dropped from both tables.
   Migration `20260716232514_mix_package_class_type_sets` reordered by hand-editing the
   generated file ONLY to move CREATE/backfill before DROP (user-approved); **already
   applied to local dev DB** (backfill verified 5/5 + 8/8).
3. **Server sweep** (all type-clean): bookings, availability, client-packages (3 GET
   branches + POST), revoke, package-types CRUD (`lib/server/package-type-shape.ts` is the
   shared select/shaper), billing activation, campaign-audience, birthday suggestion,
   class-type delete pre-check (now also checks ClientPackage snapshots),
   `booking-hold-count` takes `classTypeIds[]` (mix pack counts waitlist holds across all
   covered types), `createClientPackageFromType` snapshots the set (now async, flattens).
4. **Zod schemas**: `packages/types/src/catalog.ts` + `packages.ts` updated.
5. **Test/seed sweep**: ~140 mechanical `classTypeId:` → nested `classTypes:` rewrites
   across test files + `scripts/seed.ts` + `scripts/test/seed-e2e.ts` + `test/e2e/helpers/db.ts`
   (codemod driven by tsc output). `pnpm check-types` is clean EXCEPT 3 errors in
   `app/(admin)/katalog/tipovi-paketa.tsx` — that's the untouched UI (next task).

## State: TODO

- **Task 3 tail — new behavioral integration tests** (write test-first, they don't exist yet):
  - mix package books BOTH covered types, decrementing one shared pool (`bookings-class-scoping.test.ts` is the natural home)
  - narrowest-first spend when client owns single-type + mix (DB-level, through POST /bookings)
  - PackageType POST/PATCH with multiple `classTypeIds` → join rows + `classTypes` in response (`packages-types.test.ts`)
  - campaign audience set membership (`campaign-audience.test.ts`)
  - class-type delete blocked by ClientPackage snapshot reference
- **Task 4 — UI** (the 3 type errors point at the spots):
  - `app/(admin)/katalog/tipovi-paketa.tsx`: single ClassType picker → multi-select chips
    (min 1); lines 224/424/551 currently pass `classTypeId`
  - package cards / Moji paketi / assign flows: render covered set ("Reformer · Energy")
    from the new `classTypes` field
  - i18n: any new strings go in BOTH `locales/sr.json` and `locales/en.json`
  - client mutation factory already takes `classTypeIds` (`lib/queries/packages-queries-factory.ts`)
- **Task 5 — full local gate** before PR (AGENTS.md): `pnpm lint && pnpm check-types &&
  pnpm test:unit`, then integration (consent above), then `pnpm test:e2e:prepare && pnpm test:e2e`
  (prepare chain also hits the consent gate).
- Merge-time: staging still has the duplicated Reformer ClassType (seed bug) — merge those
  before this reaches staging or demo data misreads as needing mix packages.

## Gotchas discovered this session

- `prisma migrate dev` prompts interactively; `!`-prefix user commands are ALSO
  non-interactive. Working pattern: `expect -c 'spawn pnpm exec prisma migrate dev ...;
  expect -re {Are you sure} { send "y\r"; exp_continue }; expect eof'` — only after the
  user consents in chat.
- After `prisma generate`, a stale `packages/types/src/generated/prisma-zod/schemas/objects/index.ts`
  (leftover from a pre-rebase full generation; config now emits enums-only) produced ~1800
  phantom TS errors. Fix: delete that file. If it reappears, check `zod-generator.config.json`.
- `cw` symlinks the tracked `apps/mobile/.env.test` → typechange blocks rebase;
  `git checkout -- apps/mobile/.env.test` fixes it.
- Session model KEEPS scalar `classTypeId` — only PackageType/ClientPackage moved to sets.
  Don't "fix" session fixtures.
