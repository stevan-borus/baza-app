# Dependency Updates — Expo SDK 54→56 + full library refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every dependency in the monorepo up to date — Expo SDK 54→56 plus all non-Expo libraries including risky majors — verified green by the full local test suite and a launching simulator dev build, in one PR.

**Architecture:** Two-phase upgrade in a dedicated worktree, committed in stages for bisectability. Phase 1 walks the Expo SDK one major at a time (54→55→56) using `expo install --fix` so SDK-managed native packages get SDK-pinned versions, not npm-latest. Phase 2 bumps everything `expo install` doesn't manage, in lockstep groups. The existing test trophy (lint→types→unit→integration→e2e) plus `expo-doctor` and a simulator dev build is the acceptance gate — there is no new test code; the upgrade is "correct" when the existing suite stays green.

**Tech Stack:** pnpm 10.28 / Turborepo monorepo, Expo (React Native + Expo Router server output), Prisma 7 + Postgres, better-auth, TanStack Query, Tamagui/uniwind, Vitest + Playwright.

## Global Constraints

- **pnpm only.** Never npm/yarn. Go through `package.json` scripts; never invoke `tsc`/`vitest`/`playwright`/`prisma` directly except where a step explicitly uses `pnpm exec` / `expo install`.
- **Worktree path is absolute everywhere:** `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56`. Never `cd` into or reference the main checkout. Subagents must `git -C <worktree>` or `cd` into the worktree in every command.
- **Type-check via root `pnpm check-types`** (not single-package `tsc` — it skips `packages/types`). **Always pass `--force`**: turbo cache leaks across this repo's worktrees and will replay stale logs (`FULL TURBO` from another worktree path = not actually run here).
- **Expo SDK pinning rule:** SDK-managed packages (react, react-dom, react-native, react-native-reanimated, react-native-screens/svg/safe-area-context/gesture-handler, react-native-web, all `expo-*`, babel-preset-expo, react-test-renderer matching react, @types/react) take versions from `expo install --fix`, **NOT** `pnpm outdated` "latest". npm-latest runs ahead of the SDK and breaks the native build.
- **Lockstep groups — bump together or get peer errors:** prisma 4-pack (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `@prisma/client-runtime-utils`); `zod` in both `mobile` and `@baza/types`; `vitest`+`@vitest/expect` in both packages; `tailwindcss`+`@tailwindcss/postcss`; `better-auth`+`@better-auth/expo`; `react`/`react-dom`/`react-test-renderer`.
- **Prisma:** only `migrate dev|deploy|reset`; never `db push`; never hand-author migrations. This upgrade introduces **no schema change** — if `migrate status` reports drift, STOP and surface it. After any prisma version bump run `pnpm exec prisma generate` (gitignored client; no commit) or tests hit "Unknown field".
- **Commit messages:** `<type>(<scope>): <what>` + a WHY body for non-trivial commits; no Claude-Session trailer, no attribution footer.
- **Verification before completion:** no task is "done" without pasted green command output. Use `--force` so the output proves a real run, not a cache replay.
- **App config:** `app.json` is authoritative for plugins; `app.config.ts` only overlays deep-link domains. Plugin edits go in `app.json`.

---

### Task 1: Expo SDK 54 → 55

**Files:**
- Modify: `apps/mobile/package.json` (versions, via tooling)
- Modify: `pnpm-lock.yaml`
- Possibly modify: `apps/mobile/app.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js` (only if `expo install --fix` / doctor requires)

**Interfaces:**
- Consumes: clean baseline (lint 0 errors, types pass, 443 unit tests pass).
- Produces: a repo on Expo SDK 55 with the fast gate green; SDK-55-pinned versions of all SDK-managed packages that Task 2 will carry to 56.

- [ ] **Step 1: Upgrade the expo package to SDK 55 and let it fix peers**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec expo install expo@^55.0.0 --fix
```
This rewrites `expo-*`, react, react-native, reanimated, screens, etc. to SDK-55-pinned versions. Do NOT hand-edit versions.

- [ ] **Step 2: Run expo-doctor and read every finding**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec expo-doctor
```
Expected: it may report packages whose versions don't match SDK 55. For each, re-run `pnpm exec expo install <pkg> --fix`. Re-run doctor until the only remaining warnings are pre-existing/non-version ones (e.g. unmanaged third-party native libs). If doctor flags a genuinely incompatible third-party lib (e.g. keyboard-controller, gesture-handler version), note it for Task 2/3 rather than forcing.

- [ ] **Step 3: Regenerate Prisma client (deps churned)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma generate
```
Expected: "Generated Prisma Client" + "Generated Prisma Zod Generator".

- [ ] **Step 4: Run the fast gate (forced — defeat cross-worktree cache)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit
```
Expected: lint 0 errors; check-types `cache bypass, force executing` then 3 successful; unit `443 passed` (count may shift slightly if a dep ships test-visible changes — investigate any DROP from 443, additions are fine). Fix real type/lint regressions before committing (e.g. a renamed export from a bumped `expo-*` type).

- [ ] **Step 5: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.json apps/mobile/babel.config.js apps/mobile/metro.config.js 2>/dev/null
git commit -m "chore(deps): upgrade Expo SDK 54→55

Stepping one SDK major at a time per Expo's guidance — going straight to
56 skips the 55 migration notes and makes a broken native build
impossible to bisect. Versions come from expo install --fix, not
npm-latest, which runs ahead of what the SDK pins."
```

---

### Task 2: Expo SDK 55 → 56 (incl. expo-router codemod)

**Files:**
- Modify: `apps/mobile/package.json`, `pnpm-lock.yaml`
- Modify: `apps/mobile/app/_layout.tsx` (re-point react-navigation imports)
- Possibly modify: `apps/mobile/app.json` (plugin signature changes if any)

**Interfaces:**
- Consumes: SDK-55 repo with green fast gate (Task 1).
- Produces: SDK-56 repo, react-navigation imports migrated to expo-router, fast gate green. This is the final SDK target Phase 2 builds on.

- [ ] **Step 1: Upgrade the expo package to SDK 56 and fix peers**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec expo install expo@^56.0.0 --fix
```

- [ ] **Step 2: Run the expo-router ↔ react-navigation codemod**

SDK 56 removed expo-router's dependency on react-navigation. `apps/mobile/app/_layout.tsx` imports `DarkTheme`, `DefaultTheme`, `ThemeProvider` from `@react-navigation/native` — these must move.

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
npx expo-codemod sdk-56-expo-router-react-navigation-replace apps/mobile
```
If the codemod is unavailable or no-ops, do the one-file manual fix in `apps/mobile/app/_layout.tsx`: change
```ts
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
```
to the equivalent re-exports from expo-router as documented in the SDK 56 changelog (expo-router now provides these). Verify the symbols resolve via `pnpm check-types --force`. After migration, if nothing else imports `@react-navigation/native`, remove it from `package.json` dependencies.

- [ ] **Step 3: Verify no other SDK-56 breaking changes bite (grep, don't assume)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
grep -rn "expo-file-system" apps/mobile --include="*.ts" --include="*.tsx"   # async copy/move
grep -rn "react-native-webview" apps/mobile --include="*.ts" --include="*.tsx"  # DOM webview default
grep -rn "from \"@expo/vector-icons\"\|from '@expo/vector-icons'" apps/mobile  # removed from expo pkg
grep -rn "@react-navigation" apps/mobile --include="*.ts" --include="*.tsx"   # should be empty now
```
Expected per the spec's verified exposure: file-system/webview/vector-icons = no real imports (only a comment in `components/ui/icon.tsx`); navigation grep empty after Step 2. If any returns a real import, handle it (vector-icons: add `@expo/vector-icons` explicitly; file-system: switch to `copySync`/`moveSync` or await the new promises).

- [ ] **Step 4: Doctor + Prisma generate + fast gate (forced)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec expo-doctor
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma generate
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit
```
Expected: doctor clean (or only pre-existing non-version warnings); lint 0 errors; types pass; unit ≥443 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git add -A
git commit -m "chore(deps): upgrade Expo SDK 55→56 + migrate react-navigation imports

SDK 56 cut expo-router's react-navigation dependency, so the three
theme symbols in _layout.tsx moved to expo-router. Cascades react
19.1→19.2 and react-native to the SDK-56 pin. Verified by grep that the
other 56 breaking changes (file-system async, DOM webview, vector-icons)
don't touch this app."
```

---

### Task 3: Non-Expo app libraries (DB, auth, UI, app deps)

**Files:**
- Modify: `apps/mobile/package.json`, `packages/types/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: SDK-56 repo with green fast gate (Task 2).
- Produces: all non-SDK-managed app libraries at latest compatible, lockstep groups in sync, fast gate green.

- [ ] **Step 1: Bump the DB layer in lockstep**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm add @prisma/client@^7.8.0 @prisma/adapter-pg@^7.8.0 @prisma/client-runtime-utils@^7.8.0 pg@^8.22.0
pnpm add -D prisma@^7.8.0 @types/pg@^8.20.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma generate
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma migrate status
```
Expected: generate succeeds; `migrate status` reports "Database schema is up to date!" — **no drift, no new migration**. If it reports drift, STOP and surface it (do not hand-author a migration).

- [ ] **Step 2: Bump auth in lockstep, read changelog**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm add better-auth@^1.6.20 @better-auth/expo@^1.6.20
```
Then check the better-auth config sites for breaking changes:
```bash
grep -rln "better-auth" apps/mobile/lib apps/mobile/server 2>/dev/null
```
Read each hit; reconcile any renamed config option flagged by `check-types --force` in Step 4.

- [ ] **Step 3: Bump remaining app libs and the zod/tailwind lockstep sets**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm add @tanstack/react-query@^5.101.0 date-fns@^4.4.0 dayjs@^1.11.21 \
  lucide-react-native@^1.21.0 victory-native@^41.26.0 @gorhom/bottom-sheet@^5.2.14 \
  resend@^6.14.0 @react-email/render@^2.0.9 uniwind@^1.9.0 \
  tailwindcss@^4.3.1 @tailwindcss/postcss@^4.3.1 zod@^4.4.3
# zod lockstep in the types package too:
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/packages/types
pnpm add zod@^4.4.3
```
For `@react-email/components`: 1.0.12 is flagged deprecated. Check the latest non-deprecated version:
```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm view @react-email/components versions --json | tail -20
pnpm view @react-email/components deprecated
```
Pin to the highest non-deprecated version (`pnpm add @react-email/components@<version>`). If every recent version is deprecated with a named successor, note it as an out-of-scope follow-up and leave the current working version in place — do not block the PR on an email-lib migration.

- [ ] **Step 4: Regenerate Prisma + fast gate (forced)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma generate
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit
```
Expected: lint 0 errors; types pass (fix any zod-4.4 / react-query-5.101 type changes surfaced here); unit ≥443 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git add -A
git commit -m "chore(deps): bump DB, auth, and app libraries to latest

Prisma 7.4→7.8 (4-pack in lockstep), better-auth 1.4→1.6, react-query,
zod 4.4 (both packages), tailwind, date libs, charts. Confirmed prisma
migrate status reports no drift — this is a client/runtime bump with no
schema change."
```

---

### Task 4: Risky native/major bumps (verify each)

**Files:**
- Modify: `apps/mobile/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: SDK-56 repo with app libs bumped, fast gate green (Task 3).
- Produces: the three native/major bumps in place OR explicitly deferred with a note; fast gate green. These are native modules, so full validation waits for the dev build in Task 6.

- [ ] **Step 1: Read each changelog before bumping**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm view @legendapp/list@3 --json | grep -A2 homepage
pnpm view @react-native-async-storage/async-storage@3 --json | grep -A2 homepage
pnpm view @react-native-community/datetimepicker@9 --json | grep -A2 homepage
```
Open each homepage/CHANGELOG. Note any breaking API change that touches our usage:
```bash
grep -rln "@legendapp/list" apps/mobile --include="*.tsx" --include="*.ts"
grep -rln "async-storage" apps/mobile --include="*.tsx" --include="*.ts"
grep -rln "datetimepicker\|DateTimePicker" apps/mobile --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Bump the three majors**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm add @legendapp/list@^3.1.0 @react-native-async-storage/async-storage@^3.1.1 @react-native-community/datetimepicker@^9.1.0
pnpm exec expo-doctor
```
`expo-doctor` may warn that a native lib version is ahead of the SDK-recommended one. For async-storage and datetimepicker (SDK-managed-ish RN community libs), if doctor strongly flags incompatibility with SDK 56, prefer the SDK-recommended version (`pnpm exec expo install <pkg>`) over npm-latest and note the deferral. **Escape hatch:** if `@legendapp/list` 3 requires non-trivial call-site rewrites (its list API changed materially), revert that one bump (`pnpm add @legendapp/list@^2.0.19`), leave a `// TODO` note, and record it as an out-of-scope follow-up — do not let one major balloon the PR.

- [ ] **Step 3: Apply any required call-site migrations**

For each breaking change found in Step 1, edit the consuming files. (Concrete edits depend on what the changelogs say — common cases: async-storage 3 dropped the legacy `callback` API signatures; datetimepicker 9 changed an event prop name.) After editing, the proof is the type-check and unit run in Step 4 plus the e2e/dev-build later.

- [ ] **Step 4: Fast gate (forced)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit
```
Expected: lint 0 errors; types pass; unit ≥443 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git add -A
git commit -m "chore(deps): take native majors — list 3, async-storage 3, datetimepicker 9

Nothing is live yet, so absorbing these majors now beats carrying the
upgrade debt into the first real deploy. Native-module bumps, so the
real validation is the simulator dev build, not the web e2e stack."
```
(If any major was deferred per the escape hatch, reword the message to match what actually landed.)

---

### Task 5: Dev tooling

**Files:**
- Modify: root `package.json`, `apps/mobile/package.json`, `packages/types/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: app + native deps done, fast gate green (Task 4).
- Produces: build/test tooling at latest, fast gate green.

- [ ] **Step 1: Bump root tooling**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm add -D -w oxlint@^1.71.0 turbo@^2.9.18 lefthook@^2.1.9
```

- [ ] **Step 2: Bump test/build tooling in mobile + types (vitest lockstep)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm add -D @playwright/test@^1.61.0 vitest@^4.1.9 @vitest/expect@^4.1.9 tsx@^4.22.4 @types/node@^26.0.0
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/packages/types
pnpm add -D vitest@^4.1.9
```
Note `@types/node` 25→26: verify Node 22 typings still resolve in Step 4. If 26 introduces type errors against our Node 22 target, pin back to `@types/node@^25`.

- [ ] **Step 3: Reinstall Playwright browser (version bumped)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec playwright install chromium
```

- [ ] **Step 4: Fast gate (forced) — oxlint 1.71 may surface new rules**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit
```
Expected: lint may report NEW warnings from oxlint 1.71's expanded ruleset — that's fine as long as 0 errors. If new errors appear, fix or (if a rule is genuinely unwanted) note it; do not silence broadly. Types pass; unit ≥443 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git add -A
git commit -m "chore(deps): bump dev tooling — oxlint, turbo, vitest, playwright, tsx

Lint/type/test toolchain to latest. vitest bumped in lockstep across
mobile and @baza/types; playwright browser reinstalled to match."
```

---

### Task 6: Full acceptance gate — integration, e2e, dev build

**Files:** none (verification only; may produce a fixup commit if a spec breaks).

**Interfaces:**
- Consumes: all upgrades committed, fast gate green (Tasks 1–5).
- Produces: proof the upgrade holds against the real DB, real browser, and a real native build — the acceptance criteria for the PR.

- [ ] **Step 1: Start local Postgres**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
docker compose up -d
```
Expected: containers up. (Postgres on localhost:5434 per the scripts.)

- [ ] **Step 2: Integration suite (resets+migrates baza_app_test, then runs)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm test:db:prepare && pnpm test:integration
```
Expected: migrate reset succeeds with no drift; integration suite passes. (`test:db:prepare` resets `baza_app_test` — the destructive-consent gate may require `PRISMA_USER_CONSENT` / explicit confirmation; if it prompts, surface to the user.) Any failure: check whether it pre-exists on `dev` before blaming the upgrade.

- [ ] **Step 3: E2E suite (full prepare chain, then run)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm test:e2e:prepare && pnpm test:e2e
```
Expected: Playwright suite passes. e2e is NOT in CI and drifts — for any failure, confirm it reproduces on `dev` (pre-existing) vs. is an upgrade regression. Fix genuine regressions; commit fixes as `fix(...)`.

- [ ] **Step 4: Server export smoke (the Fly deploy artifact)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm exec expo-doctor
pnpm build:server
```
Expected: doctor clean; `expo export -p web` completes and writes server output without bundler errors. If a "can't resolve <pkg>" metro error appears, it's the known stale-install trap — do a full clean regenerate (rm node_modules + `pnpm store prune` + reinstall + prisma generate), not a metro shim.

- [ ] **Step 5: Simulator dev build (validates native-module bumps)**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56/apps/mobile
pnpm ios
```
Expected: a fresh native build compiles (reanimated, screens, svg, async-storage, datetimepicker at new versions) and the app launches on the simulator without a redbox. This is the gate item the web e2e stack can't cover. If `pnpm ios` isn't viable in this environment, hand this step to the user with the exact command and the launch checklist (app opens, navigate a screen using a bumped native module — date picker, a Legend list, async-storage-backed auth persistence). **Do not claim Task 6 complete until a human confirms the dev build launches**, since native bumps are the highest-risk part and aren't machine-verifiable here.

- [ ] **Step 6: Commit any fixups, then open the PR**

```bash
cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56
git status   # should be clean if no fixups were needed
git push -u origin worktree-feat+lib-updates-sdk56
gh pr create --base dev --title "chore(deps): update all libraries + Expo SDK 54→56" --body "<see PR body below>"
```
PR body must include: the phase breakdown, the verification evidence (paste the green outputs: lint/types/unit counts, integration/e2e pass, expo-doctor, dev-build confirmation), any deferred majors with reasons (out-of-scope follow-ups), and the `@react-email/components` deprecation note if unresolved. Tick the test-plan checkboxes only for steps actually run green (per project rule — no unchecked-but-claimed-passing boxes). No Claude-Session trailer, no attribution footer.

---

## Self-Review

**Spec coverage:** Phase 1 (SDK 54→55→56) = Tasks 1–2 incl. the codemod and breaking-change grep table. Phase 2 non-Expo = Task 3 (DB/auth/app + lockstep groups), Task 4 (risky majors with escape hatch), Task 5 (dev tooling, express investigation folded into install passes). Verification gate = Task 6 (all four test stages + expo-doctor + dev build). Pinning rule, lockstep groups, prisma-no-drift, app.json-authoritative, metro stale-install trap, turbo cache-leak, e2e-not-in-CI caveat all carried into Global Constraints and the relevant steps. Express/@types/express "missing" is handled in Task 3's general install churn (the install passes will re-resolve them); if still missing after Task 5, the PR notes it. **No gaps.**

**Placeholder scan:** Step 3 of Task 4 ("apply call-site migrations") and the codemod fallback in Task 2 are necessarily conditional on what the changelog/codemod produce — but each gives the exact grep to find sites, the exact symbols (`DarkTheme`/`DefaultTheme`/`ThemeProvider`), and the proof command. No bare "TODO/handle edge cases" without a concrete find-and-prove path.

**Type/version consistency:** Lockstep version targets match across steps (prisma 7.8.0, zod 4.4.3, vitest 4.1.9 everywhere they appear; better-auth 1.6.20 paired). The worktree absolute path is identical in every command. `--force` on every `check-types`. The react-navigation symbols named in Task 2 match what Step grep in baseline found in `_layout.tsx`.
