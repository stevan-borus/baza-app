import { describe, it, expect } from "vitest";
import { nativeStoreUrl } from "@/lib/app-updates/store-url";

/**
 * Turns a configured https store URL into the OS-native scheme so tapping
 * "Update" opens the store app directly instead of a browser tab.
 */
describe("nativeStoreUrl", () => {
  const iosHttps = "https://apps.apple.com/app/id1234567890";

  it("rewrites an https App Store link to itms-apps:// on iOS", () => {
    expect(nativeStoreUrl(iosHttps, "ios")).toBe(
      "itms-apps://apps.apple.com/app/id1234567890",
    );
  });

  it("uses the market:// scheme with the package id on Android", () => {
    expect(nativeStoreUrl("https://play.google.com/whatever", "android")).toBe(
      "market://details?id=com.bazapilates.app",
    );
  });

  it("returns the https url unchanged on other platforms (web)", () => {
    expect(nativeStoreUrl(iosHttps, "web")).toBe(iosHttps);
  });
});
