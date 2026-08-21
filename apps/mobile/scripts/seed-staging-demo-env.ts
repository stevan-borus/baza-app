/**
 * Side-effect-only env preamble for the staging demo seed.
 * Imported as the first statement of seed-staging-demo.ts so prisma's
 * env-validating imports see all required vars.
 *
 * DATABASE_URL is intentionally NOT defaulted — the caller must point the
 * script at a database explicitly (staging non-pooled URL, or a local DB for
 * a rehearsal run). Everything else only exists to satisfy env.server.ts's
 * eager validation and is never used by the seed.
 */
if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required. Pass the NON-POOLED staging Neon URL:\n" +
      '  DATABASE_URL="postgresql://..." pnpm exec tsx scripts/seed-staging-demo.ts [--dry-run|--wipe-only]',
  );
  process.exit(1);
}

const seedEnvDefaults: Record<string, string> = {
  RESEND_API_KEY: "seed-dummy",
  RESEND_FROM_EMAIL: "Seed <seed@example.com>",
  EXPO_ACCESS_TOKEN: "seed-dummy",
  API_ADMIN_BOOTSTRAP_TOKEN: "seed-dummy",
  BETTER_AUTH_SECRET: "seed-dummy-secret-min-16-chars",
  BASE_URL: "http://localhost:3010",
};
for (const [key, value] of Object.entries(seedEnvDefaults)) {
  if (!(key in process.env)) process.env[key] = value;
}

// All schedule times in the seed are Belgrade wall-clock times; generating
// them in any other zone would shift every session. Node picks up TZ set at
// startup, so force it here (before any Date math) and verify it took.
if (!process.env.TZ) process.env.TZ = "Europe/Belgrade";
const resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (resolvedTz !== "Europe/Belgrade") {
  console.error(
    `Timezone is ${resolvedTz}, need Europe/Belgrade. Re-run with TZ=Europe/Belgrade prefixed.`,
  );
  process.exit(1);
}
