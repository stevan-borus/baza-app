/**
 * Single source of truth for the scheduled jobs that hit our `/api/cron/*`
 * endpoints. The in-process scheduler was removed (it pinned the server to one
 * stateful instance); these jobs now run as an external Fly Machines schedule
 * that POSTs each endpoint with the `x-cron-token` header.
 *
 * `scripts/gen-fly-crons.ts` renders this manifest into the runnable Fly
 * commands, and test/unit/cron-jobs.test.ts keeps it honest against the
 * endpoints that actually exist.
 *
 * Schedules are UTC, 5-field cron. They translate the old
 * CRON_*_INTERVAL_MS *intentions* into real wall-clock times rather than
 * loops: daily digests early-morning, campaign dispatch every 30 min.
 */
export type CronJob = {
  name: string;
  endpointPath: string;
  /** 5-field cron expression, UTC. */
  schedule: string;
  /** Why this cadence — kept next to the schedule so it can't silently drift. */
  rationale: string;
};

export const CRON_JOBS: CronJob[] = [
  {
    name: "reminders",
    endpointPath: "/api/cron/notifications/reminders",
    schedule: "0 6 * * *",
    rationale: "Daily 06:00 UTC — session reminders for the day ahead.",
  },
  {
    name: "package-expiry",
    endpointPath: "/api/cron/notifications/package-expiry",
    schedule: "30 6 * * *",
    rationale: "Daily 06:30 UTC — warn clients whose packages expire soon.",
  },
  {
    name: "session-consumption",
    endpointPath: "/api/cron/sessions/consumption",
    schedule: "0 7 * * *",
    rationale: "Daily 07:00 UTC — reconcile attended sessions against packages.",
  },
  {
    name: "birthdays",
    endpointPath: "/api/cron/notifications/birthdays",
    schedule: "0 7 * * *",
    rationale:
      "Daily 07:00 UTC — one studio, Europe/Belgrade, so 09:00 CEST / 08:00 CET. " +
      "Hourly was an interval-loop artifact: its first run of the day sat near UTC midnight = late evening local.",
  },
  {
    name: "campaigns-dispatch",
    endpointPath: "/api/cron/campaigns/dispatch",
    schedule: "*/30 * * * *",
    rationale: "Every 30 min — worst-case send-time drift, tolerable for marketing.",
  },
];
