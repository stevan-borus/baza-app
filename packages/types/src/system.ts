import { z } from "zod";

/**
 * Wire schemas for the system endpoints — health and the store-version nudge.
 * These are what `respond()` validates on the route; the app-updates hook
 * parses a subset ({ minVersion, latestVersion }) of the app-version payload.
 */

/** GET /api/health — uptime probe payload. */
export const healthResponseSchema = z.object({
  success: z.literal(true),
  service: z.literal("baza-api"),
  status: z.literal("ok"),
  ts: z.iso.datetime(),
});

/** GET /api/app-version?platform=ios|android — store min/latest versions. */
export const appVersionResponseSchema = z.object({
  success: z.literal(true),
  platform: z.enum(["ios", "android"]),
  /** Lowest version still allowed to run; below this the app hard-blocks. */
  minVersion: z.string(),
  /** Newest version on the store; soft-nudge when the user is below it. */
  latestVersion: z.string(),
});
