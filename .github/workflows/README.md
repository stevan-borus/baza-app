# CI

`ci.yml` runs on every PR to `dev`/`main` and on push to `dev`.

## Jobs

1. **Lint · Types · Unit** — DB-free fast gate. `pnpm lint`, `pnpm check-types`,
   `pnpm test:unit`. Generates the (gitignored) Prisma client first so type-check
   and unit imports resolve.
2. **Integration · E2E (ephemeral Neon branch)** — creates a throwaway Neon
   branch per run, applies migrations, runs the integration suite, then resets +
   rich-seeds and runs the Playwright e2e suite. The branch is **always deleted**
   afterwards (success, failure, or cancellation) so we never leak branches.

## Required configuration

Set these in **Settings → Secrets and variables → Actions** before the
`db-tests` job can run:

| Kind | Name | Value |
|------|------|-------|
| Variable | `NEON_PROJECT_ID` | Your Neon project id |
| Secret | `NEON_API_KEY` | A Neon API key with branch create/delete rights |

Until they're set, the first (lint/types/unit) job still runs; the `db-tests`
job is skipped on forked PRs (no secret access) and will fail on internal PRs
with a clear "missing project_id" until configured.

## Notes

- The ephemeral branch is provisioned with `neondatabase/create-branch-action`;
  its `db_url` output is passed as `DATABASE_URL` / `TEST_DATABASE_URL` so the
  `:ci` test scripts and the Playwright web server all hit the same branch.
- `migrate reset` in the e2e prepare trips Prisma 7's destructive-action gate;
  the workflow consents via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`,
  scoped to the throwaway branch only. See the inline comment in `ci.yml`.
- e2e currently was **not** in CI (specs drifted) — this job puts both
  integration and e2e behind every PR for the first time.
