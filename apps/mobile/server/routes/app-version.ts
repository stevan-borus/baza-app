import { appVersionResponseSchema } from "@baza/types/system";
import appJson from "@/app.json";
import { respond } from "@/lib/server/http";
import { parsePlatformParam, resolveAppVersion } from "@/lib/server/app-version";

/**
 * GET /api/app-version?platform=ios|android
 *   → { success, platform, minVersion, latestVersion }
 *
 * Public, auth-free, DB-free. The mobile app polls this to decide whether the
 * installed native binary is below the minimum allowed (hard block) or merely
 * behind the latest (soft nudge). See lib/server/app-version.ts for how the
 * values are sourced (env vars, defaulting to the app's own version → inert).
 */
export async function GET(request: Request) {
  const platform = parsePlatformParam(
    new URL(request.url).searchParams.get("platform"),
  );
  const fallback = appJson.expo.version;
  const info = resolveAppVersion(process.env, platform, fallback);
  return respond(appVersionResponseSchema, { success: true, platform, ...info });
}
