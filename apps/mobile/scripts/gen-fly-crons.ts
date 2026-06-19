/**
 * Renders the cron manifest (lib/server/cron-jobs.ts) into a supercronic
 * crontab for the Fly `cron` process. Fly's native --schedule only supports
 * hourly/daily/weekly/monthly keywords, so full cron expressions (e.g. every
 * 30 min, 06:30 daily) need supercronic running in a dedicated, single-count
 * Fly process — see https://fly.io/docs/blueprints/task-scheduling/.
 *
 * Generate one crontab per environment (the base URL differs):
 *
 *   pnpm --filter mobile exec tsx scripts/gen-fly-crons.ts \
 *     --base-url https://baza-api-staging.fly.dev > crontab.staging
 *
 * Ship the crontab in the image and run it via the `cron` process in fly.toml:
 *   [processes]
 *     app  = "pnpm run start:server"
 *     cron = "supercronic /app/crontab"
 *   fly scale count cron=1   # exactly one, or jobs double-fire
 *
 * Each line curls its endpoint with the x-cron-token header; the token comes
 * from the CRON_TOKEN env at runtime (set it to API_ADMIN_BOOTSTRAP_TOKEN), so
 * it is never written into the crontab.
 */
import { CRON_JOBS } from "@/lib/server/cron-jobs";

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const baseUrl = readArg("--base-url");

if (!baseUrl) {
  console.error(
    "Usage: tsx scripts/gen-fly-crons.ts --base-url <https://app.fly.dev>",
  );
  process.exit(1);
}

const normalizedBase = baseUrl.replace(/\/$/, "");

const lines: string[] = [
  `# supercronic crontab for ${normalizedBase} — generated from lib/server/cron-jobs.ts`,
  "# Run via the `cron` process in fly.toml; CRON_TOKEN must be set in the env.",
  "",
];

for (const job of CRON_JOBS) {
  const url = `${normalizedBase}${job.endpointPath}?mode=scheduled`;
  // -fsS: fail (non-zero exit) on a non-2xx so supercronic logs the failure.
  const command = `curl -fsS -X POST -H "x-cron-token: $CRON_TOKEN" "${url}"`;
  lines.push(`# ${job.name}: ${job.rationale}`);
  lines.push(`${job.schedule} ${command}`);
  lines.push("");
}

process.stdout.write(`${lines.join("\n")}\n`);
