/**
 * Native store URL for "go update the app". Prefers the OS-native scheme so the
 * link opens directly in the App Store / Play Store app rather than a browser.
 *
 * The package id is shared with app.json (`com.bazapilates.app`). iOS rewrites
 * a configured https App Store link to the itms-apps:// scheme; callers pass the
 * https URL from EXPO_PUBLIC_IOS_STORE_URL.
 *
 * Pure (platform passed in) so the scheme rewrite is unit-testable without
 * importing react-native — the hook supplies `Platform.OS`.
 */
const ANDROID_PACKAGE = "com.bazapilates.app";

export function nativeStoreUrl(httpsUrl: string, platform: string): string {
  if (platform === "android") {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  if (platform === "ios") {
    return httpsUrl.replace(/^https?:\/\//, "itms-apps://");
  }
  return httpsUrl;
}
