import { Platform } from "react-native";

/**
 * Sets the iOS app icon badge count. No-op on web. On Android the value is
 * typically managed by the launcher itself; expo-notifications can still
 * influence it but most Android launchers ignore the call — safe to keep.
 *
 * The call is fire-and-forget; we never want a badge failure to surface as
 * a user-visible error.
 */
async function setAppBadgeCount(count: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(Math.max(0, Math.trunc(count)));
  } catch {
    // expo-notifications unavailable in this environment (e.g. some sims
    // without push entitlements) — silently skip.
  }
}

export async function clearAppBadge(): Promise<void> {
  return setAppBadgeCount(0);
}
