/**
 * Helper for per-spec-file DB reset (Q2(b) in the test plan).
 *
 * Each Playwright spec calls `await resetAndSeed()` in a `test.beforeAll`
 * to start from the rich seed baseline. Tests within a file share state.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "../../..");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public";

/**
 * Re-applies the rich seed by running scripts/test/seed-e2e.ts. The seed
 * itself is idempotent — it deletes everything it creates before re-creating.
 * This keeps each spec file's tests sharing a known baseline.
 *
 * Assumption: schema is already in sync via `pnpm test:db:prepare`.
 */
export async function resetAndSeed() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/test/seed-e2e.ts"], {
    cwd: APP_DIR,
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });
}
