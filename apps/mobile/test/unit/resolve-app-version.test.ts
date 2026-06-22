import { describe, it, expect } from "vitest";
import { resolveAppVersion } from "@/lib/server/app-version";

/**
 * The store-nudge endpoint reports, per platform, the lowest version still
 * allowed to run (minVersion) and the newest version on the store
 * (latestVersion). Values come from server env vars; this resolver reads them
 * with a safe default so the feature is INERT until an operator sets them.
 */
describe("resolveAppVersion", () => {
  const fallback = "1.0.0";

  it("reads iOS values from the iOS-specific env vars", () => {
    const env = {
      APP_MIN_VERSION_IOS: "1.2.0",
      APP_LATEST_VERSION_IOS: "1.5.0",
    };
    expect(resolveAppVersion(env, "ios", fallback)).toEqual({
      minVersion: "1.2.0",
      latestVersion: "1.5.0",
    });
  });

  it("reads Android values from the Android-specific env vars", () => {
    const env = {
      APP_MIN_VERSION_ANDROID: "2.0.0",
      APP_LATEST_VERSION_ANDROID: "2.3.0",
    };
    expect(resolveAppVersion(env, "android", fallback)).toEqual({
      minVersion: "2.0.0",
      latestVersion: "2.3.0",
    });
  });

  it("does not let iOS env vars leak into the Android response", () => {
    const env = {
      APP_MIN_VERSION_IOS: "9.9.9",
      APP_LATEST_VERSION_IOS: "9.9.9",
    };
    expect(resolveAppVersion(env, "android", fallback)).toEqual({
      minVersion: fallback,
      latestVersion: fallback,
    });
  });

  it("defaults both to the fallback when env vars are unset (inert)", () => {
    expect(resolveAppVersion({}, "ios", fallback)).toEqual({
      minVersion: fallback,
      latestVersion: fallback,
    });
  });

  it("defaults a single missing value independently", () => {
    const env = { APP_LATEST_VERSION_IOS: "1.4.0" };
    expect(resolveAppVersion(env, "ios", fallback)).toEqual({
      minVersion: fallback,
      latestVersion: "1.4.0",
    });
  });

  it("ignores blank/whitespace env values and uses the fallback", () => {
    const env = { APP_MIN_VERSION_IOS: "   ", APP_LATEST_VERSION_IOS: "" };
    expect(resolveAppVersion(env, "ios", fallback)).toEqual({
      minVersion: fallback,
      latestVersion: fallback,
    });
  });

  it("trims surrounding whitespace from a set value", () => {
    const env = { APP_MIN_VERSION_IOS: " 1.1.0 " };
    expect(resolveAppVersion(env, "ios", fallback).minVersion).toBe("1.1.0");
  });
});
