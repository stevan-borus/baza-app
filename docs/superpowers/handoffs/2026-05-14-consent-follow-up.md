# Handoff — consent follow-up (continuing on `consent-gate` branch)

## What's already done

**PR #32** — https://github.com/stevan-borus/baza-app/pull/32 — branch `consent-gate`, base `dev`. **Ready for review, NOT merged.** 31 commits ahead of `dev`.

What landed: full consent gate, server + UI + e2e. Append-only `ConsentRecord` ledger, 7 API endpoints, `/consent` gate screen, `/legal/[key]` viewer, auth-screen language toggle, admin `ClientLegalPanel`, `MINOR_PAPER_NEEDED` notification trigger, client-side `ConsentGateRedirect` wrapper (closed a Task 15 hole where the middleware matcher `/(client)/[...path]` never fired because expo-router strips route-group names from URLs), feature-flagged via `BAZA_CONSENT_GATE_ENABLED` (default `false`).

Tests: 180 unit / 314 integration / e2e green (3 consent-gate + 88 adjacent suites + two drive-by flake fixes for `datetime-picker-smoke` and `trainer-clients-sticky-header`).

Full breakdown in the PR body — don't restate it in this handoff.

## User's decision for this session

**Build the follow-up scope on the same `consent-gate` branch and merge it all together later.** Do NOT open a separate PR. New commits land on `consent-gate` and ride along on PR #32.

## Follow-up scope (from PR body "Out of scope")

1. **`ClientHealthIntake` + `HealthIntakeWithdrawal` models** — health/medical disclosure schema, accept + withdrawal endpoints, surfacing on `/consent` or in profile.
2. **Social-media consent question** (Da/Ne) — typically a checkbox on the consent screen or in profile.
3. **Profile-sheet "Pravna dokumenta" / "Zdravstveni podaci" sections** — re-read accepted docs + manage health intake from the profile sheet.
4. **Booking gate for unverified minors** — block bookings after first session until `guardianVerifiedAt` is set (depends on #1 if health intake is also required).

The user hasn't picked an ordering yet. Last conversation turn ended just before they were going to choose between **schema-first** (land `ClientHealthIntake` schema + endpoints, then UI consumers, then booking gate) or **vertical slices** (each item shipped end-to-end as its own slice).

**Next session should start by either**
- asking the user which ordering they want, OR
- reading the spec at `docs/superpowers/specs/2026-05-14-client-legal-consent-design.md` and proposing a plan via `superpowers:writing-plans`.

## Worktree

Path: `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate`
Branch: `consent-gate` tracking `origin/consent-gate`.

**CRITICAL — see `feedback_subagent_must_cd_to_worktree.md`**: subagent shells default to the main checkout cwd. Every Bash call in a subagent prompt must use `git -C /Users/stevanborus/Desktop/baza-app/.claude/worktrees/consent-gate` for git, or `cd <worktree-path> && ...` chained in the same call. Three times in the previous session subagents were caught about to commit on `dev` because of this.

Before each subagent commits, the prompt must require: `git -C <worktree> rev-parse --abbrev-ref HEAD` (must return `consent-gate`); and after commit, verify the new SHA is on the right branch.

## Branch state

Last 4 commits on `consent-gate`:

- `f1437ba test(e2e): unflake datetime-picker + trainer-clients-sticky-header`
- `7e51cb5 chore(consent): drop unused catch param + adminId test var`
- `969f37e fix(consent): client-side gate redirect + seed consents for non-gate-target users`
- `7715cc9 perf(notifications): hoist admin query out of minor-paper-needed booking loop`

Before resuming: `git -C <worktree> fetch origin && git -C <worktree> log dev..origin/dev --oneline` to check if `dev` advanced. If so, rebase. Last full check before laptop shutdown showed `dev` had not advanced.

## Resolved decisions (don't re-litigate)

These are baked in from PR #32 work; carry them forward into the follow-up:

1. **Append-only ledger.** Every consent change writes a new `ConsentRecord` row. Never `UPDATE`/`DELETE`. Withdrawal = new row with `accepted: false`. Same pattern should apply to `HealthIntakeWithdrawal`.
2. **Evidence captured server-side.** `extractEvidence(request)` reads from headers; endpoints silently override any client-supplied `ipAddress`/`userAgent`. Test `consent-accept.test.ts` enforces it. Apply same discipline to health-intake endpoints.
3. **Versioning via `ACTIVE_VERSIONS`** (`apps/mobile/lib/legal/versions.ts`). Bumping triggers re-consent for users with older accepted versions. `health_intake` will need an entry here if it's gated.
4. **Bundled markdown at build time** via `apps/mobile/scripts/generate-legal-bundle.ts`. Source files in `docs/legal/{sr,en}/<key>-v1.md`. If health-intake documents need to be served as text, add `health_intake-v1.md` and re-run the bundle script.
5. **Feature flag stays `BAZA_CONSENT_GATE_ENABLED`** for now. If health-intake needs its own toggle, decide explicitly — don't introduce a second flag without reason.
6. **Mutation hooks in queries-factory files** — components don't call `useMutation` directly. See `feedback_mutation_hooks_in_factory.md`.
7. **No memoization** — React Compiler is on. See `feedback_react_compiler_no_memo.md`.
8. **Studio visual system** — className over inline style, Serbian = Latinica forms. See `AGENTS.md`.
9. **TDD for everything.** See user's global `/Users/stevanborus/.claude/CLAUDE.md`.

## Memories that apply directly to this work

All under `/Users/stevanborus/.claude/projects/-Users-stevanborus-Desktop-baza-app/memory/` (also indexed in `MEMORY.md`):

- `feedback_never_hand_author_migrations.md` — if `prisma migrate dev` fails, STOP and ask the user; never hand-author the SQL.
- `feedback_subagent_must_cd_to_worktree.md` — use `git -C <path>` in every Bash call from a subagent.
- `feedback_react_compiler_no_memo.md` — no `useMemo`/`useCallback`/`React.memo` in new components.
- `feedback_mutation_hooks_in_factory.md` — `useMutation` lives as exported hook in the queries-factory file.
- `feedback_serbian_not_croatian.md` — Latinica forms only.
- `feedback_anchor_time_tests.md` — use `now()`/`nowMs()` from `@/lib/now` for "current time" in seed/test logic.
- `feedback_prisma_migrations.md` — never `prisma db push`.
- `feedback_subagent_pr_checkboxes.md` — don't claim tests pass without independently verifying.

## Tooling reminders

- Package manager: **pnpm** only.
- Lint: `pnpm lint` (oxlint via turbo).
- Type check: `pnpm --filter mobile check-types`.
- Tests: `pnpm --filter mobile test:unit`, `test:integration`, `test:e2e`. For a single e2e file: `pnpm exec playwright test test/e2e/<file>.spec.ts`.
- Prisma: `pnpm --filter mobile exec prisma migrate dev --name <name>`. If it fails or drifts, STOP and surface to user.

## Watch-points carried over

- **Subagent reliability**: prior session caught subagents incorrectly reporting "typecheck has pre-existing errors" three times — every time, independent re-check showed clean. Always verify typecheck/test claims independently before marking a task done.
- **E2E load flake**: full-suite e2e (`pnpm --filter mobile test:e2e`) can crash the dev server mid-run under sustained load. Failures with `ERR_CONNECTION_REFUSED` are server crashes, not test bugs. To verify a real failure, re-run the affected spec in isolation via `pnpm exec playwright test test/e2e/<file>.spec.ts`.
- **Gorhom AppSheet backdrop lingers after Escape** — use `.dispatchEvent("click")` for follow-up navigation in e2e tests.
- **React Navigation keeps inactive tabs mounted** → `getByTestId(...)` may resolve two elements; use `.first()`.
- **`apps/mobile/.env.test`** shows as a `typechange` in `git status` of the worktree — that's the `cw` symlink, not yours to commit. Stash it before `git rebase`.

## Recommended skills for next session

- **`superpowers:brainstorming`** — for `ClientHealthIntake` schema design (it's not trivially obvious what fields belong on a health intake form for a pilates studio; surface questions before writing code).
- **`superpowers:writing-plans`** — once scope is clear. The PR #32 plan (`docs/superpowers/plans/2026-05-14-consent-gate.md`) was the template; was deleted as part of Task 26 wrap-up — write a new one for the follow-up.
- **`superpowers:subagent-driven-development`** — for executing the plan. Worked well in the prior session once subagent prompts forced `git -C <worktree>` and pre-commit branch verification.
- **`superpowers:test-driven-development`** — for every server helper, endpoint, and component (per global TDD rule).
- **`superpowers:verification-before-completion`** — required for marking tasks done; do NOT rely on subagent self-reports.

## Final words

PR #32 is shippable today (flag-off merge is safe). The user is choosing to expand scope on the same branch instead of merging-and-iterating, so the next session continues on `consent-gate`. Build the follow-up the same way: TDD, append-only ledger pattern, server-side evidence capture, mutation-in-factory, no memo, Latinica Serbian.

When the follow-up scope is done, re-run the full test stack one more time, rebase onto `origin/dev` (might have moved), push, and the PR is ready to land.
