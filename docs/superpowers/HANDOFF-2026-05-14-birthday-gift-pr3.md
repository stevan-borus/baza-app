# Handoff — PR 3 (Birthday Gift Flow), paused at Task 2

**Worktree:** `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat-birthday-gift/`
**Branch:** `feat/birthday-gift` (off `dev`)
**Plan:** [`docs/superpowers/plans/2026-05-14-birthday-gift-flow.md`](./plans/2026-05-14-birthday-gift-flow.md)
**Initiative status:**
- PR 1 (client DOB) — **merged** as #29
- PR 2 (cancellation notifications) — **merged** as #31
- PR 3 (this branch) — **paused mid-Task 2**

---

## What's blocking PR 3 and how to unblock it

We hit **real drift** when Task 2 tried to run `db:migrate`. The local `baza_app` DB has migration `20260514145313_consent_records` applied — that migration belongs to **PR #32 (consent gate)**, which is currently OPEN against `dev` and **MERGEABLE**.

PR #32 touches files that PR 3 also touches, so the right move is **(a) merge PR #32 first, then (b) rebase `feat/birthday-gift` onto the new `dev`, then (c) continue from Task 2**.

### Shared-file overlap with PR #32 (what to expect on rebase)

PR #32 touches these files that PR 3's plan also wants to modify — handle conflicts deliberately:

| File | PR #32 does | PR 3 wants to do |
|---|---|---|
| `apps/mobile/prisma/schema.prisma` | Adds `ConsentRecord` model + `ConsentDocumentKey` enum + 2 `NotificationType` values (`CONSENT_REFUSED`, `MINOR_PAPER_NEEDED`) | Adds `isBirthdayGift` to `PackageType` + 2 different `NotificationType` values (`BIRTHDAY_ADMIN_PROMPT`, `BIRTHDAY_CLIENT_GIFT`) |
| `packages/i18n/src/notification-messages.ts` | Adds keys for `CONSENT_REFUSED`, `MINOR_PAPER_NEEDED` | Adds keys for `BIRTHDAY_ADMIN_PROMPT`, `BIRTHDAY_CLIENT_GIFT` |
| `packages/types/src/index.ts` | Various additions | Extends `packageTypeInputSchema` + `updatePackageTypeInputSchema` with `isBirthdayGift` + cross-field refinement |
| `apps/mobile/scripts/test/seed-e2e.ts` | +86 lines (seeds consent records) | No PR 3 changes planned — leave consent additions in place |
| `apps/mobile/lib/server/env.server.ts` | +6 lines | Adds `CRON_BIRTHDAYS_INTERVAL_MS` |
| `apps/mobile/locales/{sr,en}.json` | +50 keys each (legal/consent strings) | Adds catalog `isBirthdayGift` label (Task 8) |
| `apps/mobile/components/admin/client-detail.tsx` | +6 lines | No PR 3 changes |
| `apps/mobile/lib/queries/clients-queries-factory.ts` | +22 lines | Maybe extends `update` payload type (Task 8) |
| `apps/mobile/test/integration/setup-db.ts` | +1 line | None |

The conflicts are all **additive** — both PRs add at the end of enums / dicts / Zod schemas / locale objects. Resolution is mechanical (keep both sets of additions, alphabetize or append-in-order as the file style dictates).

---

## Exactly where to resume

### Pre-resume cleanup (the agent should do this first)

1. **Revert the stranded `schema.prisma` edit** still sitting uncommitted from Task 2's halt:
   ```bash
   cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat-birthday-gift
   git checkout apps/mobile/prisma/schema.prisma
   git status --short   # expect: empty
   ```
   The edit will be re-applied as part of Task 2 once the rebase is done — but it'll be re-applied against the post-rebase schema, where `NotificationType` already has the consent enum values.

2. **Pull the merged `dev`:**
   ```bash
   cd /Users/stevanborus/Desktop/baza-app
   git fetch origin --prune
   git checkout dev
   git pull --ff-only origin dev
   ```

3. **Rebase `feat/birthday-gift` onto the new `dev`:**
   ```bash
   cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat-birthday-gift
   git rebase origin/dev
   ```
   The branch only has 2 commits (`dfb38a4 docs: fix prisma command syntax`, `716cd49 docs: plan`), both docs-only — the rebase should be trivially clean (no code conflicts).

4. **Verify the consent migration is now in the worktree's `prisma/migrations/` dir:**
   ```bash
   ls apps/mobile/prisma/migrations | grep consent_records
   # expect: 20260514145313_consent_records
   ```
   If present, the drift is gone — `db:migrate` will run cleanly.

5. **Confirm migrations are in sync** before re-running Task 2:
   ```bash
   pnpm --filter mobile db:status
   # expect: "Database schema is up to date!" with 11 migrations (the original 10 + consent_records)
   ```

### Then resume Task 2 (schema migration)

Follow the plan exactly: [`docs/superpowers/plans/2026-05-14-birthday-gift-flow.md`](./plans/2026-05-14-birthday-gift-flow.md) → Task 2. Edit `schema.prisma` to add `isBirthdayGift` + the 2 birthday `NotificationType` values, then `pnpm --filter mobile db:migrate -- --name add_birthday_gift_support`. The migration should now generate cleanly.

**Critical rule (must not be violated):** if `db:migrate` reports drift or fails again, STOP and surface the command to the user. Do NOT hand-author the SQL. See memory `feedback_never_hand_author_migrations.md` and [`feedback_never_hand_author_migrations.md`](../../../../../../../../.claude/projects/-Users-stevanborus-Desktop-baza-app/memory/feedback_never_hand_author_migrations.md).

### After Task 2 succeeds

Continue Tasks 3–12 per the plan. The TodoWrite list has them all queued (#23–#32 still pending). When picking each up, the next agent should:
- Mark the next pending task `in_progress`.
- Dispatch a fresh subagent per task using `superpowers:subagent-driven-development` (same pattern as PR 1 and PR 2).
- Two-stage review (spec compliance → code quality) for substantive tasks.
- Skip dual review for trivial tasks (i18n adds, ADR doc, CONTEXT.md doc updates) — same as previous PRs.

---

## Skills the next session should use

- **`superpowers:subagent-driven-development`** — dispatching fresh subagents per task with two-stage review. Same pattern that shipped PRs 1 + 2 cleanly.
- Don't re-run `superpowers:writing-plans` — the plan exists and is correct. Only update it if the rebase reveals a structural conflict in the plan's task ordering (unlikely).
- Don't re-run `grill-with-docs` — design decisions are fully locked in CONTEXT.md and the plan.

---

## Context the next agent will need

- **AGENTS.md rule:** `pnpm` only, never `npx`. Prisma scripts go through `db:migrate` / `db:deploy` / `db:status` wrappers (NOT raw `prisma <cmd>`).
- **Anchor time:** `TEST_ANCHOR_TIME=2026-05-11T09:00:00Z` (Monday). PR 1's seed fixture set `client.active.reformer@e2e.test` DOB to `1990-05-11` so the cron's "today's birthday match" test (Task 6) lands deterministically.
- **The user has explicitly forbidden hand-authoring Prisma migration SQL.** Past PR attempts had subagents bypass with `migrate diff --script` — that's the violation memory `feedback_never_hand_author_migrations` was created to prevent.
- **Serbian copy, NOT Croatian.** Task 4 adds "Srećan rođendan" (sr) — `ć` not `t`. There's a separate memory enforcing this.
- **The drift the agent saw was real this time.** Earlier PRs in this initiative hit a *false-positive* drift report from `migrate dev` (fresh-worktree shadow-DB diff noise). This time the drift is genuine: PR #32's `consent_records` migration was applied to the shared `baza_app` DB. The fix is the rebase plan above, not a DB reset.

---

## Active TodoWrite state (as of pause)

```
#21 [completed]   Task 1: Verify project context
#22 [in_progress] Task 2: Schema migration — isBirthdayGift + 2 new NotificationType values
#23 [pending]     Task 3: Zod refinement — isBirthdayGift && sessionCount=1
#24 [pending]     Task 4: i18n message keys (sr + en)
#25 [pending]     Task 5: Suggested-ClassType helper
#26 [pending]     Task 6: cron:birthdays endpoint + scheduler + env
#27 [pending]     Task 7: Fire BIRTHDAY_CLIENT_GIFT on grant
#28 [pending]     Task 8: Catalog UI — isBirthdayGift toggle
#29 [pending]     Task 9: Filter Nova uplata to exclude isBirthdayGift
#30 [pending]     Task 10: initialPackageTypeId deep-link prop
#31 [pending]     Task 11: ADR-0007 — birthday gift reuses Poklon paket
#32 [pending]     Task 12: Final sweep + push + PR
```

After the rebase + Task 2 retry, Task 2 will be the first to flip from `in_progress` → `completed`.

---

## Stray state on disk (resolved by the pre-resume cleanup above)

- `apps/mobile/prisma/schema.prisma` has an uncommitted edit from the halted Task 2 attempt (added `isBirthdayGift` field + the 2 new enum values). It needs to be reverted before the rebase, then re-applied as part of the retried Task 2.
- No migration directory was created — the file the agent would have generated never materialized because Prisma's drift check blocked it.
- No other stray files; no other branches affected.
