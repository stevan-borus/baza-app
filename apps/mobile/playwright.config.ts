import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8010);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Token the spec sends in the `x-cron-token` header AND the value the
 * Expo dev server's env loader exports as `API_ADMIN_BOOTSTRAP_TOKEN`.
 * Aligning them via the webServer command keeps the cron specs from
 * depending on whatever value is in the shared `.env`.
 */
const CRON_TOKEN = "test-admin-bootstrap-token";
process.env.API_ADMIN_BOOTSTRAP_TOKEN = CRON_TOKEN;

/**
 * Anchor instant the entire stack pins to during E2E. Server reads
 * TEST_ANCHOR_TIME via `lib/now.ts`; helpers and the browser fixture
 * resolve it from this same env var so seed/server/helpers/browser all
 * agree on "current time". See CONTEXT.md → "Anchor time".
 */
const TEST_ANCHOR_TIME = process.env.TEST_ANCHOR_TIME ?? "2026-05-11T09:00:00Z";
process.env.TEST_ANCHOR_TIME = TEST_ANCHOR_TIME;

/**
 * Test database — physically separate from the dev DB (`baza_app`). The Expo
 * dev server auto-loads `apps/mobile/.env`, which points at dev. We must
 * override `DATABASE_URL` in the webServer command (Node respects later env
 * vars over dotenv defaults), otherwise specs would write to the dev DB
 * while `test:e2e:prepare` reset `baza_app_test`. Helpers and seed scripts
 * already default to this same URL — see `apps/mobile/scripts/test/`
 * and `test/e2e/helpers/db.ts`.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app_test?schema=public";

/**
 * Pin the test-runner process's own DATABASE_URL to the test DB too. Specs
 * talk to Postgres directly (seed setup, assertions) via their own Prisma
 * clients, which resolve `process.env.DATABASE_URL ?? <local default>`. If the
 * runner is launched without DATABASE_URL exported (the bare `playwright test`
 * script does not set it), a spec with a stray `baza_app` default would write
 * its setup rows into the DEV database while the server reads `baza_app_test`
 * — the row is invisible to the server and the spec fails confusingly (e.g.
 * 404 "session not available"). Worse, its `resetAndSeed()` would wipe the dev
 * DB. Pinning here makes spec-side Prisma always hit the test DB regardless of
 * any individual spec's local default.
 */
process.env.DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // BAZA_CONSENT_GATE_ENABLED=true: the consent gate is enabled for the
    // entire E2E run. The flag is read by the dev server at module-load time
    // (env.server.ts:46), so it cannot be toggled per-spec from inside the
    // Playwright process. The seed seeds ConsentRecord rows for every user
    // that should NOT see the gate (admin, trainers, already-onboarded clients)
    // so those flows keep their pre-existing login → tab behaviour. The one
    // intentionally unconsented user is client.unconsented@e2e.test,
    // which the consent-gate spec uses for the first-time flow.
    command: `CI=1 EXPO_PUBLIC_API_URL=${BASE_URL} BASE_URL=${BASE_URL} APP_WEB_URL=${BASE_URL} DATABASE_URL=${TEST_DATABASE_URL} API_ADMIN_BOOTSTRAP_TOKEN=${CRON_TOKEN} TEST_ANCHOR_TIME=${TEST_ANCHOR_TIME} BAZA_CONSENT_GATE_ENABLED=true NODE_OPTIONS="--max-old-space-size=8192" expo start --web --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
