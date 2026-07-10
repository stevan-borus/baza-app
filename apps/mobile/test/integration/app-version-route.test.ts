import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/server/routes/app-version";
import appJson from "@/app.json";

/**
 * Exercises the real /api/app-version route handler with real env + the real
 * app.json import. No DB, no auth — it's a config endpoint.
 */
const VERSION_KEYS = [
  "APP_MIN_VERSION_IOS",
  "APP_LATEST_VERSION_IOS",
  "APP_MIN_VERSION_ANDROID",
  "APP_LATEST_VERSION_ANDROID",
];

function clearVersionEnv() {
  for (const key of VERSION_KEYS) delete process.env[key];
}

async function callRoute(platform?: string) {
  const qs = platform ? `?platform=${platform}` : "";
  const res = await GET(new Request(`http://localhost/api/app-version${qs}`));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/app-version", () => {
  afterEach(clearVersionEnv);

  it("defaults min+latest to the app's own version when env is unset (inert)", async () => {
    clearVersionEnv();
    const { status, body } = await callRoute("ios");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      platform: "ios",
      minVersion: appJson.expo.version,
      latestVersion: appJson.expo.version,
    });
  });

  it("returns the iOS env values for platform=ios", async () => {
    process.env.APP_MIN_VERSION_IOS = "1.2.0";
    process.env.APP_LATEST_VERSION_IOS = "1.5.0";
    const { body } = await callRoute("ios");
    expect(body).toMatchObject({
      platform: "ios",
      minVersion: "1.2.0",
      latestVersion: "1.5.0",
    });
  });

  it("returns the Android env values for platform=android", async () => {
    process.env.APP_MIN_VERSION_ANDROID = "2.0.0";
    process.env.APP_LATEST_VERSION_ANDROID = "2.3.0";
    const { body } = await callRoute("android");
    expect(body).toMatchObject({
      platform: "android",
      minVersion: "2.0.0",
      latestVersion: "2.3.0",
    });
  });

  it("defaults to iOS when ?platform is missing or invalid", async () => {
    process.env.APP_MIN_VERSION_IOS = "3.0.0";
    const missing = await callRoute();
    const invalid = await callRoute("windows-phone");
    expect(missing.body.platform).toBe("ios");
    expect(invalid.body.platform).toBe("ios");
    expect(missing.body.minVersion).toBe("3.0.0");
  });
});
