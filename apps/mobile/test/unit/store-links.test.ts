import { describe, expect, it } from "vitest";
import { getStoreTarget } from "@/lib/store-links";

const IOS_URL = "https://apps.apple.com/app/id123";
const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.steva.borus.bazapilates";
const urls = { ios: IOS_URL, android: ANDROID_URL };

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe("getStoreTarget", () => {
  it("sends an iPhone to the iOS App Store", () => {
    expect(getStoreTarget(IPHONE_UA, urls)).toEqual({
      platform: "ios",
      url: IOS_URL,
    });
  });

  it("sends an Android device to the Play Store", () => {
    expect(getStoreTarget(ANDROID_UA, urls)).toEqual({
      platform: "android",
      url: ANDROID_URL,
    });
  });

  it("returns no target for desktop browsers (no banner there)", () => {
    expect(getStoreTarget(DESKTOP_UA, urls)).toEqual({
      platform: "other",
      url: null,
    });
  });

  it("returns no target for an empty/unknown user-agent", () => {
    expect(getStoreTarget("", urls)).toEqual({ platform: "other", url: null });
  });

  it("yields a null url when the matched platform's store URL is unset", () => {
    expect(getStoreTarget(IPHONE_UA, { ios: "", android: ANDROID_URL })).toEqual(
      { platform: "ios", url: null },
    );
  });
});
