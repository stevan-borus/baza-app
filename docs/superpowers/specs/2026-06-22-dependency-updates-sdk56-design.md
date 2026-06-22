# Dependency Updates — Expo SDK 54 → 56 + full library refresh

**Date:** 2026-06-22
**Branch / workspace:** dedicated git worktree `feat/lib-updates-sdk56` off `dev`
**Status:** Design — awaiting user review

## Goal

Bring every dependency in the monorepo up to date ahead of the first deploy.
Nothing is live yet; the only deploy artifact at this stage is a **new dev
build for the iOS simulator**. The safety net is therefore "the dev build runs
and the full local test suite is green," not "production stays up." That lets us
be aggressive: take the Expo SDK major and the risky non-Expo majors now, while
the blast radius is contained.

## Non-goals

- No production / EAS release build, no OTA push. Native version bumps land but
  are only validated via a local dev build + the web export used by the test
  stack.
- No feature work, no refactors beyond what an upgrade strictly requires (e.g.
  the expo-router ↔ react-navigation codemod).
- The unrelated `feat/expo-updates-popup` worktree is untouched.

## Constraints (from AGENTS.md / project memory)

- **pnpm only.** Go through `package.json` scripts; never invoke `tsc` /
  `vitest` / `playwright` / `prisma` directly.
- **Type-check via `pnpm check-types` from repo root** — a single-package `tsc`
  skips `packages/types` (stricter tsconfig) and hides real errors.
- **Worktree work uses absolute paths or `git -C <worktree>` throughout.** Never
  `cd` into or reference the main checkout.
- **Prisma:** only `migrate dev|deploy|reset`; never `db push`. No hand-authored
  migrations — this upgrade should produce **none** (no schema change), so if
  `migrate` reports drift, stop and surface it.
- **TDD / verification-before-completion:** no "done" claim without pasted green
  command output. CI only runs the fast DB-free gate; integration + e2e are run
  locally before the PR.

## Approach: two phases, separate commits

Done in one worktree but committed in stages so a broken dev build can be
bisected.

### Phase 1 — Expo SDK 54 → 56

Expo's official guidance is **upgrade one SDK at a time**. So:

1. `pnpm --filter mobile exec expo install expo@^55 --fix` → resolve peer deps →
   `expo-doctor` → fast gate → **commit** (`chore(deps): expo SDK 54→55`).
2. `pnpm --filter mobile exec expo install expo@^56 --fix` → resolve peer deps →
   `expo-doctor` → **commit** (`chore(deps): expo SDK 55→56`).
3. Run the required SDK-56 codemod for the expo-router ↔ react-navigation split:
   `npx expo-codemod sdk-56-expo-router-react-navigation-replace apps/mobile`.

**Version pinning rule:** the SDK-managed packages (react, react-native,
react-native-reanimated, react-native-screens / svg / safe-area-context /
gesture-handler, all `expo-*`, babel-preset-expo, react-native-web, @types/react)
get their versions from `expo install --fix`, **NOT** from `pnpm outdated`'s
"latest". npm-latest is frequently *ahead* of what the SDK pins and breaks the
native build.

**SDK-56 breaking-change exposure (verified by grep, not assumed):**

| Breaking change | Exposure in this repo | Action |
|---|---|---|
| expo-router drops react-navigation dep | `app/_layout.tsx` only — imports `DarkTheme`, `DefaultTheme`, `ThemeProvider` from `@react-navigation/native` | Codemod (or 1-line manual re-point to `expo-router`) |
| `@expo/vector-icons` removed from `expo` pkg | None — only a *comment* in `components/ui/icon.tsx`; app uses `lucide-react-native` | None |
| expo-file-system copy/move now async | None found | None |
| `@expo/dom-webview` default for DOM components | No `react-native-webview` usage found | None |
| `expo/fetch` default `globalThis.fetch` | Verify server/auth fetch paths in smoke test | Watch during verify; opt out via `EXPO_PUBLIC_USE_RN_FETCH=1` only if a regression appears |
| min iOS 16.4 / Node 20.19.4 / Xcode 26.4 | Node engine already `>=22`; iOS only affects real-device targets, not simulator dev build | None blocking |

Expo config note: repo has **both** `app.json` and `app.config.ts`. Confirm
which is authoritative before assuming plugin edits land where expected (Expo
merges, with `app.config.ts` taking precedence). The 5 config plugins
(expo-router, expo-localization, expo-splash-screen, expo-image-picker,
expo-notifications) all ship in SDK 56 — verify their plugin signatures didn't
change.

### Phase 2 — non-Expo libraries

Everything `expo install` does **not** manage, to latest, verified. Commit as
logical groups so a regression is bisectable.

- **DB layer (lockstep — versions must match):** `prisma`, `@prisma/client`,
  `@prisma/adapter-pg`, `@prisma/client-runtime-utils` 7.4 → 7.8; `pg`,
  `@types/pg`. After bump: `pnpm exec prisma generate` (gitignored, no commit) to
  avoid the stale-client "Unknown field" trap; confirm `prisma migrate status`
  reports no drift.
- **Auth (lockstep):** `better-auth` + `@better-auth/expo` 1.4 → 1.6. Read the
  1.5/1.6 changelog for breaking auth-config changes; auth e2e must pass.
- **App libs:** `@tanstack/react-query`, `zod` (both `mobile` and
  `@baza/types`, lockstep), `date-fns`, `dayjs`, `lucide-react-native`,
  `victory-native`, `@gorhom/bottom-sheet`, `resend`, `@react-email/components`
  (note: 1.0.12 is flagged deprecated — pin to the last non-deprecated or take
  the maintained successor), `@react-email/render`, `uniwind`, `tailwindcss` +
  `@tailwindcss/postcss` (lockstep).
- **Risky majors (include + verify each against its changelog):**
  `@legendapp/list` 2 → 3, `@react-native-async-storage/async-storage` 2 → 3,
  `@react-native-community/datetimepicker` 8 → 9. (async-storage and
  datetimepicker are native modules — they need the new dev build to validate.)
  If a major's migration is large enough to be its own project, **stop and flag
  it** rather than forcing it into this PR.
- **Dev tooling:** `oxlint` 1.48 → 1.71, `turbo` 2.8 → 2.9, `@playwright/test`,
  `vitest` + `@vitest/expect` (lockstep, both packages), `tsx`, `lefthook`,
  `@types/node` (25 → 26 — verify Node 22 typings still resolve),
  `@types/react-dom`, `react-test-renderer` (must track react version).

### Express / `@types/express`

`pnpm outdated` shows these as "missing (wanted …)" — likely a transitive/install
artifact, not a real gap. Investigate during the install pass; only add if
genuinely required by `server/`.

## Verification gate (per phase and at the end)

Run from `apps/mobile` in the worktree (absolute paths / `git -C`):

```sh
# Fast gate (also what CI runs)
pnpm lint && pnpm check-types && pnpm test:unit   # check-types from repo root

# Integration (real localhost Postgres)
docker compose up -d
pnpm test:db:prepare && pnpm test:integration

# E2E (full prepare chain + run)
pnpm test:e2e:prepare && pnpm test:e2e

# Deploy-artifact smoke checks
pnpm --filter mobile exec expo-doctor
pnpm --filter mobile build:server          # expo export -p web — the Fly artifact
# New simulator dev build (validates native-module bumps)
pnpm --filter mobile ios                   # or eas build --profile development
```

All four test stages green + a clean `expo-doctor` + a dev build that launches
on the simulator = done. Any integration/e2e failure: first check whether it
pre-exists on `dev` (e2e is not in CI and drifts) before blaming the upgrade;
fix genuine regressions before the PR.

## Risks & mitigations

- **Native-module bumps need a real build to validate.** reanimated, screens,
  async-storage, datetimepicker, svg won't fully surface in the web e2e stack.
  Mitigation: the simulator dev build is part of the gate, explicitly.
- **`expo install --fix` and `pnpm outdated` disagree.** Expected and correct —
  `--fix` wins for SDK-managed packages. Documented as the pinning rule above.
- **Lockstep packages drift.** prisma 4-pack, zod ×2, vitest ×2, tailwind ×2,
  react/react-dom/react-test-renderer, better-auth ×2 — bump each set together
  or get peer-dep errors. Listed explicitly above.
- **A major (e.g. @legendapp/list 3) turns out to be a big migration.** Don't
  force it; carve it out as a follow-up and note it in the PR.
- **Metro web-bundle stale-install errors after the churn.** Known trap: fix
  with a full clean regenerate (rm node_modules + store prune + reinstall +
  prisma generate), not a metro.config shim.

## Out-of-scope follow-ups to capture in the PR

- Any major bump deferred for being too large.
- `@react-email/components` deprecation resolution if the successor needs real work.
