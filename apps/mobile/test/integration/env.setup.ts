// Vitest pre-populates BASE_URL with "/", which fails Zod URL validation in
// env.server.ts. Always overwrite. Other vars use blank-only fill below.
process.env.BASE_URL = "http://localhost:3010";

function setIfBlank(key: string, value: string) {
  if (!process.env[key]) process.env[key] = value;
}

setIfBlank("DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public");
setIfBlank("RESEND_API_KEY", "test-resend-api-key");
setIfBlank("RESEND_FROM_EMAIL", "Test <test@example.com>");
setIfBlank("EXPO_ACCESS_TOKEN", "test-expo-access-token");
setIfBlank("API_ADMIN_BOOTSTRAP_TOKEN", "test-bootstrap-token");
setIfBlank("CRON_AUTOSTART", "false");
setIfBlank("CRON_REMINDERS_INTERVAL_MS", "60000");
setIfBlank("CRON_PACKAGE_EXPIRY_INTERVAL_MS", "60000");
setIfBlank("CRON_SESSION_CONSUMPTION_INTERVAL_MS", "60000");
setIfBlank("BETTER_AUTH_SECRET", "test-better-auth-secret-min-16-chars");
setIfBlank("APP_WEB_URL", "http://localhost:3010");
// Anchor time for date-dependent integration tests — see CONTEXT.md → "Anchor time".
setIfBlank("TEST_ANCHOR_TIME", "2026-05-09T10:00:00Z");
