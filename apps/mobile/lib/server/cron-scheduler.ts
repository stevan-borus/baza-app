import { env } from "@/lib/server/env";

type CronJobConfig = {
  name: string;
  endpointPath: string;
  intervalMs: number;
};

type SchedulerState = {
  started: boolean;
  timers: Array<ReturnType<typeof setInterval>>;
};

declare global {
  // eslint-disable-next-line no-var
  var __bazaCronSchedulerState__: SchedulerState | undefined;
}

function getSchedulerState() {
  if (!globalThis.__bazaCronSchedulerState__) {
    globalThis.__bazaCronSchedulerState__ = {
      started: false,
      timers: [],
    };
  }
  return globalThis.__bazaCronSchedulerState__;
}

async function runCronJob(job: CronJobConfig) {
  const url = new URL(job.endpointPath, env.BASE_URL);
  url.searchParams.set("mode", "scheduled");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-cron-token": env.API_ADMIN_BOOTSTRAP_TOKEN,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(
      `[cron-scheduler] ${job.name} failed (${response.status}): ${body}\n`,
    );
    return;
  }

  process.stdout.write(`[cron-scheduler] ${job.name} ok\n`);
}

function scheduleJob(job: CronJobConfig) {
  void runCronJob(job).catch((error) => {
    process.stderr.write(`[cron-scheduler] ${job.name} error: ${String(error)}\n`);
  });

  const timer = setInterval(() => {
    void runCronJob(job).catch((error) => {
      process.stderr.write(
        `[cron-scheduler] ${job.name} error: ${String(error)}\n`,
      );
    });
  }, job.intervalMs);

  const state = getSchedulerState();
  state.timers.push(timer);
}

/**
 * Starts in-process cron scheduler once per server process.
 * Disabled by default; enable via CRON_AUTOSTART=true.
 */
export function startCronScheduler() {
  const state = getSchedulerState();
  if (state.started || !env.CRON_AUTOSTART) {
    return;
  }

  state.started = true;

  const jobs: CronJobConfig[] = [
    {
      name: "reminders",
      endpointPath: "/api/cron/notifications/reminders",
      intervalMs: env.CRON_REMINDERS_INTERVAL_MS,
    },
    {
      name: "package-expiry",
      endpointPath: "/api/cron/notifications/package-expiry",
      intervalMs: env.CRON_PACKAGE_EXPIRY_INTERVAL_MS,
    },
    {
      name: "session-consumption",
      endpointPath: "/api/cron/sessions/consumption",
      intervalMs: env.CRON_SESSION_CONSUMPTION_INTERVAL_MS,
    },
    {
      name: "birthdays",
      endpointPath: "/api/cron/notifications/birthdays",
      intervalMs: env.CRON_BIRTHDAYS_INTERVAL_MS,
    },
  ];

  for (const job of jobs) {
    scheduleJob(job);
  }

  process.stdout.write("[cron-scheduler] started\n");
}
