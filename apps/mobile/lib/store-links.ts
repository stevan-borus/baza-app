/**
 * Decide which app store (if any) to point a *web* visitor at.
 *
 * Universal Links / App Links open the native app when it's installed; when it
 * isn't, the OS just opens the URL in the browser. This helper is the browser
 * half of that fallback: from the user-agent, work out whether the visitor is
 * on iOS or Android and hand back the matching store URL so the page can offer
 * a "Get the app" link. Desktop gets nothing — there's no app to install.
 *
 * Pure on purpose: store URLs are passed in (sourced from EXPO_PUBLIC_* env at
 * the call site), so the platform logic is trivially testable in isolation.
 */

export type StorePlatform = "ios" | "android" | "other";

export type StoreTarget = {
  platform: StorePlatform;
  /** null when no app store applies, or the matched store's URL is unset. */
  url: string | null;
};

export type StoreUrls = {
  ios: string;
  android: string;
};

export function getStoreTarget(
  userAgent: string,
  urls: StoreUrls,
): StoreTarget {
  const platform = detectPlatform(userAgent);
  if (platform === "ios") return { platform, url: urls.ios || null };
  if (platform === "android") return { platform, url: urls.android || null };
  return { platform: "other", url: null };
}

function detectPlatform(userAgent: string): StorePlatform {
  // iPadOS 13+ reports a Mac UA but carries touch; the iPhone/iPad/iPod tokens
  // cover the common case we care about for an emailed invite link.
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}
