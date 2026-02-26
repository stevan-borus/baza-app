type CronJob =
  | "reminders"
  | "package-expiry"
  | "session-consumption";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const jobArg = process.argv[2] as CronJob | undefined;
  if (
    !jobArg ||
    (jobArg !== "reminders" &&
      jobArg !== "package-expiry" &&
      jobArg !== "session-consumption")
  ) {
    console.error(
      "Usage: pnpm --filter mobile cron:run <reminders|package-expiry|session-consumption> [--mode scheduled|immediate] [--window-minutes N] [--window-days N] [--lookback-hours N] [--dry-run]",
    );
    process.exit(1);
  }

  const mode = readArg("--mode") ?? "immediate";
  const windowMinutes = readArg("--window-minutes");
  const windowDays = readArg("--window-days");
  const lookbackHours = readArg("--lookback-hours");
  const dryRun = process.argv.includes("--dry-run");

  const params = new URLSearchParams({ mode });
  if (windowMinutes) params.set("windowMinutes", windowMinutes);
  if (windowDays) params.set("windowDays", windowDays);
  if (lookbackHours) params.set("lookbackHours", lookbackHours);
  if (dryRun) params.set("dryRun", "true");

  const baseUrl = process.env.CRON_BASE_URL ?? "http://localhost:8081";
  const token = process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "";
  if (!token) {
    console.error("Missing API_ADMIN_BOOTSTRAP_TOKEN in environment.");
    process.exit(1);
  }

  const endpointPathByJob: Record<CronJob, string> = {
    reminders: "/api/cron/notifications/reminders",
    "package-expiry": "/api/cron/notifications/package-expiry",
    "session-consumption": "/api/cron/sessions/consumption",
  };
  const endpoint = `${endpointPathByJob[jobArg]}?${params.toString()}`;
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-cron-token": token,
      "content-type": "application/json",
    },
  });

  const text = await response.text();
  console.log(`POST ${url}`);
  console.log(`status=${response.status}`);
  console.log(text);

  if (!response.ok) {
    process.exit(1);
  }
}

void main();
