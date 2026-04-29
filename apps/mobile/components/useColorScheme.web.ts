import { useThemePreference } from "@/lib/theme-preference";

export function useColorScheme() {
  return useThemePreference().resolvedTheme;
}
