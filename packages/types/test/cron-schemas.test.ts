import { describe, expect, it } from "vitest";
import {
  cronBirthdaysResponseSchema,
  cronCampaignsDispatchResponseSchema,
  cronPackageExpiryResponseSchema,
  cronRemindersResponseSchema,
  cronSessionsConsumptionResponseSchema,
} from "../src/cron";

const window = { from: "2026-07-03T00:00:00.000Z", to: "2026-07-06T00:00:00.000Z" };

describe("cronCampaignsDispatchResponseSchema", () => {
  it("accepts the dispatch summary", () => {
    expect(
      cronCampaignsDispatchResponseSchema.safeParse({
        success: true,
        dryRun: false,
        dispatched: 2,
      }).success,
    ).toBe(true);
  });
});

describe("cronBirthdaysResponseSchema", () => {
  it("accepts the real-run payload (no dryRun field)", () => {
    expect(
      cronBirthdaysResponseSchema.safeParse({
        success: true,
        today: "2026-07-03",
        matchSet: [{ month: 7, day: 3 }],
        matchedClients: 1,
        sent: 2,
      }).success,
    ).toBe(true);
  });
  it("accepts the dry-run payload (dryRun: true)", () => {
    expect(
      cronBirthdaysResponseSchema.safeParse({
        success: true,
        dryRun: true,
        today: "2026-07-03",
        matchSet: [{ month: 7, day: 3 }, { month: 2, day: 29 }],
        matchedClients: 3,
        sent: 0,
      }).success,
    ).toBe(true);
  });
});

describe("cronPackageExpiryResponseSchema", () => {
  it("accepts the expiry-scan summary", () => {
    expect(
      cronPackageExpiryResponseSchema.safeParse({
        success: true,
        mode: "scheduled",
        dryRun: false,
        windowDays: 3,
        window,
        sent: 4,
        scannedPackages: 10,
      }).success,
    ).toBe(true);
  });
});

describe("cronRemindersResponseSchema", () => {
  it("accepts the reminders summary", () => {
    expect(
      cronRemindersResponseSchema.safeParse({
        success: true,
        mode: "immediate",
        dryRun: true,
        windowMinutes: 180,
        window,
        sent: 5,
        sessionsChecked: 3,
      }).success,
    ).toBe(true);
  });
});

describe("cronSessionsConsumptionResponseSchema", () => {
  it("accepts the consumption summary", () => {
    expect(
      cronSessionsConsumptionResponseSchema.safeParse({
        success: true,
        mode: "scheduled",
        dryRun: false,
        lookbackHours: 6,
        window,
        scannedBookings: 8,
        consumed: 5,
        alreadyConsumed: 2,
        noEligiblePackage: 1,
        failed: 0,
      }).success,
    ).toBe(true);
  });
});
