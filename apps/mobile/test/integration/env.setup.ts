/**
 * Loads test-only env defaults BEFORE any application module is imported. The
 * mobile app's `env.server.ts` is strict — it parses with Zod at import time —
 * so we must populate every required key here. Non-secret values only.
 *
 * We use `||=` (not `??=`) because Vite/Vitest may have populated empty strings
 * from a checked-out `.env` file; we want test-friendly defaults to win over
 * blank values.
 */
// Vite/Vitest pre-populates BASE_URL with "/" — that's not a valid URL, so we
// always overwrite it for the integration env. Other vars use blank-only fill.
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
