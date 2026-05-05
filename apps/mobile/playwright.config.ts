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
    command: `CI=1 EXPO_PUBLIC_API_URL=${BASE_URL} BASE_URL=${BASE_URL} APP_WEB_URL=${BASE_URL} API_ADMIN_BOOTSTRAP_TOKEN=${CRON_TOKEN} NODE_OPTIONS="--max-old-space-size=8192" expo start --web --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
