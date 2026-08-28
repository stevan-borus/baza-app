import { z } from "zod";

/**
 * Wire schemas for the cron endpoints. These responses go to the external
 * scheduler (Fly cron / manual curl), not the app — the schemas exist so
 * `respond()` still guards the payload shape at the route in dev and tests.
 */

/** UTC scan window of a cron run, ISO instants after JSON serialization. */
const cronWindowSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

/** "immediate" = manual/test invocation with a wide window; "scheduled" = the real tick. */
const cronModeSchema = z.enum(["immediate", "scheduled"]);

/** POST /api/cron/campaigns/dispatch */
export const cronCampaignsDispatchResponseSchema = z.object({
  success: z.literal(true),
  dryRun: z.boolean(),
  dispatched: z.number(),
});

/** POST /api/cron/notifications/birthdays — the real run omits `dryRun`. */
export const cronBirthdaysResponseSchema = z.object({
  success: z.literal(true),
  dryRun: z.boolean().optional(),
  /** UTC calendar date of the run (YYYY-MM-DD). */
  today: z.iso.date(),
  /** Month/day pairs matched — two entries when Feb 29 folds into Mar 1. */
  matchSet: z.array(z.object({ month: z.number(), day: z.number() })),
  matchedClients: z.number(),
  sent: z.number(),
});

/** POST /api/cron/notifications/package-expiry */
export const cronPackageExpiryResponseSchema = z.object({
  success: z.literal(true),
  mode: cronModeSchema,
  dryRun: z.boolean(),
  windowDays: z.number(),
  window: cronWindowSchema,
  sent: z.number(),
  scannedPackages: z.number(),
});

/** POST /api/cron/notifications/reminders */
export const cronRemindersResponseSchema = z.object({
  success: z.literal(true),
  mode: cronModeSchema,
  dryRun: z.boolean(),
  windowMinutes: z.number(),
  window: cronWindowSchema,
  sent: z.number(),
  sessionsChecked: z.number(),
  /** Trainer daily-schedule digests dispatched (one per trainer, not per session). */
  trainerDigestsSent: z.number(),
});

/** POST /api/cron/sessions/consumption */
export const cronSessionsConsumptionResponseSchema = z.object({
  success: z.literal(true),
  mode: cronModeSchema,
  dryRun: z.boolean(),
  lookbackHours: z.number(),
  window: cronWindowSchema,
  scannedBookings: z.number(),
  consumed: z.number(),
  alreadyConsumed: z.number(),
  noEligiblePackage: z.number(),
  failed: z.number(),
});
