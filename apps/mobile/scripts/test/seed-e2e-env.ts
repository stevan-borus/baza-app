/**
 * Side-effect-only env preamble for the rich seed.
 * Imported as the first statement of seed-e2e.ts so prisma's env-validating
 * imports see all required vars even when the script runs standalone.
 */
const seedEnvDefaults: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public",
  RESEND_API_KEY: "test-resend-api-key",
  RESEND_FROM_EMAIL: "Test <test@example.com>",
  EXPO_ACCESS_TOKEN: "test-expo-access-token",
  API_ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token",
  CRON_AUTOSTART: "false",
  CRON_REMINDERS_INTERVAL_MS: "60000",
  CRON_PACKAGE_EXPIRY_INTERVAL_MS: "60000",
  CRON_SESSION_CONSUMPTION_INTERVAL_MS: "60000",
  BETTER_AUTH_SECRET: "test-better-auth-secret-min-16-chars",
  BASE_URL: "http://localhost:3010",
};
for (const [key, value] of Object.entries(seedEnvDefaults)) {
  if (!process.env[key]) process.env[key] = value;
}
