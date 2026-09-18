import { describe, expect, test } from "vitest";
import {
  CRON_JOBS,
  SCHEDULED_CONSUMPTION_LOOKBACK_HOURS,
} from "@/lib/server/cron-jobs";

describe("CRON_JOBS manifest", () => {
  test("covers every /api/cron endpoint that runs on a schedule", () => {
    const paths = CRON_JOBS.map((job) => job.endpointPath).sort();
    expect(paths).toEqual(
      [
        "/api/cron/campaigns/dispatch",
        "/api/cron/notifications/birthdays",
        "/api/cron/notifications/package-expiry",
        "/api/cron/notifications/reminders",
        "/api/cron/sessions/consumption",
      ].sort(),
    );
  });

  test("every job has a unique name", () => {
    const names = CRON_JOBS.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every schedule is a 5-field cron expression", () => {
    for (const job of CRON_JOBS) {
      expect(job.schedule.trim().split(/\s+/)).toHaveLength(5);
    }
  });

  test("every endpoint path is absolute and under /api/cron", () => {
    for (const job of CRON_JOBS) {
      expect(job.endpointPath.startsWith("/api/cron/")).toBe(true);
    }
  });

  test("birthdays runs once a day at a concrete wall-clock time", () => {
    // Baza is one studio in Europe/Belgrade, so the birthday prompt wants a
    // single run inside local business hours. A wildcard or stepped hour
    // fires around UTC midnight too, which is late evening in Belgrade —
    // that firing wins the per-day dedupe key and buries the daytime one.
    const birthdays = CRON_JOBS.find((job) => job.name === "birthdays");
    expect(birthdays).toBeDefined();
    const [minute, hour] = birthdays!.schedule.trim().split(/\s+/);
    expect(hour).toMatch(/^\d+$/);
    expect(minute).toMatch(/^\d+$/);
  });

  test("session-consumption lookback outlasts the gap between two runs", () => {
    // A 6h window under a daily cron only ever caught sessions ending between
    // 01:00 and 07:00 UTC; every daytime session went unconsumed.
    const consumption = CRON_JOBS.find((job) => job.name === "session-consumption");
    expect(consumption).toBeDefined();
    const [minute, hour, dayOfMonth, month, dayOfWeek] = consumption!.schedule
      .trim()
      .split(/\s+/);
    // Fixed minute + fixed hour + wildcard date fields = fires once every 24h.
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
    const gapHours = 24;
    expect(SCHEDULED_CONSUMPTION_LOOKBACK_HOURS).toBeGreaterThanOrEqual(gapHours + 24);
  });
});
