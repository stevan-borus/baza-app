# CI

`ci.yml` runs on every PR to `dev`/`main` and on push to `dev`.

## Jobs

1. **Lint · Types · Unit** — DB-free fast gate (~1-2min). `pnpm lint`,
   `pnpm check-types`, `pnpm test:unit`. Generates the (gitignored) Prisma client
   first so type-check and unit imports resolve.

That's the only CI job. **Integration and e2e are deliberately NOT in CI.**

## Why no integration/e2e in CI

Both suites need a real Postgres. Run against a remote Neon branch they take
~40min (the integration suite is `fileParallelism: false` — serial by design to
avoid DB races — so every query pays network latency). That's too slow to gate
every PR on.

Instead they run **locally before opening a PR**, against the localhost Postgres
(`docker compose up`), where the same suites finish in ~1-2min. The contract is
in `AGENTS.md` → "Before opening a PR". This keeps PR feedback fast while still
catching drift before code is proposed.

If a scheduled/nightly Neon-backed run is ever wanted, re-add a `db-tests` job
(see git history of this file for the full ephemeral-branch recipe) and set the
two Neon values below.

## Neon values (only needed if a DB-backed CI job is re-added)

Set in **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|------|------|-------|
| Variable | `NEON_PROJECT_ID` | Your Neon project id |
| Secret | `NEON_API_KEY` | A Neon API key with branch create/delete rights |
