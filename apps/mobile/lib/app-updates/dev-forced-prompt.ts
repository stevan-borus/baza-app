import type { UpdatePrompt } from "@/lib/app-updates/decide-update-prompt";

/**
 * Validates the EXPO_PUBLIC_FORCE_UPDATE_PROMPT dev-preview value into an
 * UpdatePrompt, or null when there's no (valid) override. expo-updates is
 * disabled in dev/Expo Go, so this is the only way to see the popups in a
 * simulator. The hook honours the result ONLY under __DEV__.
 */
const FORCEABLE: readonly UpdatePrompt[] = ["ota", "store-soft", "store-required"];

export function devForcedPrompt(value: string | undefined): UpdatePrompt | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return (FORCEABLE as readonly string[]).includes(trimmed)
    ? (trimmed as UpdatePrompt)
    : null;
}
