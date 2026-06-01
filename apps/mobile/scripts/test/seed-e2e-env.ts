/**
 * Side-effect-only env preamble for the rich seed.
 * Imported as the first statement of seed-e2e.ts so prisma's env-validating
 * imports see all required vars even when the script runs standalone.
 *
 * Includes the test-suite anchor instant so any standalone seed run produces
 * the same dataset the server (also pinned to the same anchor) expects to
 * see. See CONTEXT.md → "Anchor time".
 */
const seedEnvDefaults: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/baza_app_test?schema=public",
  RESEND_API_KEY: "test-resend-api-key",
  RESEND_FROM_EMAIL: "Test <test@example.com>",
  EXPO_ACCESS_TOKEN: "test-expo-access-token",
  API_ADMIN_BOOTSTRAP_TOKEN: "test-bootstrap-token",
  CRON_AUTOSTART: "false",
  CRON_REMINDERS_INTERVAL_MS: "60000",
  CRON_PACKAGE_EXPIRY_INTERVAL_MS: "60000",
  CRON_SESSION_CONSUMPTION_INTERVAL_MS: "60000",
  CRON_BIRTHDAYS_INTERVAL_MS: "3600000",
  BETTER_AUTH_SECRET: "test-better-auth-secret-min-16-chars",
  BASE_URL: "http://localhost:3010",
  TEST_ANCHOR_TIME: "2026-05-09T10:00:00Z",
};
// Use presence, not truthiness: a var the caller set explicitly — even to an
// empty string — is an intentional choice and must win over the default. This
// is what lets `dev:db:reseed` pass `TEST_ANCHOR_TIME=''` to opt out of the
// test anchor and seed against the real wall-clock (today), instead of the
// empty string being treated as "unset" and clobbered back to the anchor.
for (const [key, value] of Object.entries(seedEnvDefaults)) {
  if (!(key in process.env)) process.env[key] = value;
}
