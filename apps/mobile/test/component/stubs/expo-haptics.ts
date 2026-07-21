/**
 * Component-test stub for `expo-haptics` — native-only side effects, no-op
 * in the browser.
 */
export const ImpactFeedbackStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
} as const;

export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;

export async function impactAsync(_style?: unknown) {}
export async function notificationAsync(_type?: unknown) {}
export async function selectionAsync() {}
