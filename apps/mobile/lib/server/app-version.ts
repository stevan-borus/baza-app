/**
 * Server-side resolver for the store-version nudge.
 *
 * The mobile app asks "is my installed binary too old?"; the answer lives in
 * server env vars an operator bumps when a new native build ships:
 *
 *   APP_MIN_VERSION_IOS / APP_LATEST_VERSION_IOS
 *   APP_MIN_VERSION_ANDROID / APP_LATEST_VERSION_ANDROID
 *
 * Both default to a passed-in fallback (the app's own marketing version) so the
 * feature is INERT until those vars are set — nobody gets nagged or blocked by
 * an unconfigured deploy.
 *
 * Pure (env passed in, not read globally) so platform/default behaviour is
 * unit-testable without booting the full serverEnv schema.
 */

export type AppVersionPlatform = "ios" | "android";

export type AppVersionInfo = {
  /** Lowest version still allowed to run; below this the app hard-blocks. */
  minVersion: string;
  /** Newest version on the store; soft-nudge when the user is below it. */
  latestVersion: string;
};

function readOr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function resolveAppVersion(
  env: Record<string, string | undefined>,
  platform: AppVersionPlatform,
  fallback: string,
): AppVersionInfo {
  const suffix = platform === "ios" ? "IOS" : "ANDROID";
  return {
    minVersion: readOr(env[`APP_MIN_VERSION_${suffix}`], fallback),
    latestVersion: readOr(env[`APP_LATEST_VERSION_${suffix}`], fallback),
  };
}

/** Narrow an untrusted ?platform= query value, defaulting to iOS. */
export function parsePlatformParam(value: string | null): AppVersionPlatform {
  return value === "android" ? "android" : "ios";
}
