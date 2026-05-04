/**
 * Design token constants — both static (default = dark, for backwards
 * compatibility with existing imports) and a runtime-resolved set via
 * `useThemeTokens()` which flips with the active theme.
 *
 * For className-based styling, prefer the Tailwind utilities (`bg-glass`,
 * `text-foreground`, etc.) which auto-flip via global.css. Use these JS
 * constants only when passing hex colors to non-Uniwind APIs (FontAwesome
 * icon `color`, LinearGradient `colors`, react-navigation themes,
 * react-native-reanimated worklets).
 */

import { useThemePreference } from "@/lib/theme-preference";

// ── Static (dark-mode) values — kept for backwards compatibility ─────────
// All existing imports of GLASS_BG, ACCENT, etc. resolve to these.
// New code should prefer `useThemeTokens()` for theme-correct values.
export const GLASS_BG = "rgba(255,255,255,0.05)";
export const GLASS_BORDER = "rgba(255,255,255,0.10)";
export const GLASS_BG_ANDROID = "rgba(20,25,30,0.95)";

export const ACCENT = "#2e5b42";
export const ACCENT_LIGHT = "#5aa07e";
export const DANGER = "#ef4444";
export const WARNING = "#f59e0b";

export const TEXT_PRIMARY_OPACITY = 0.92;
export const TEXT_SECONDARY_OPACITY = 0.55;
export const TEXT_TERTIARY_OPACITY = 0.35;

// ── Theme-aware token sets ───────────────────────────────────────────────

export type ThemeTokens = {
  background: string;
  surface: string;
  surface2: string;

  foreground: string;
  muted: string;
  faint: string;

  glass: string;
  glassStrong: string;
  glassBorder: string;
  glassAndroid: string;

  accent: string;
  accentSoft: string;
  accentLight: string;

  header: string;
  headerForeground: string;
  headerMuted: string;

  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;

  divider: string;
};

const lightTokens: ThemeTokens = {
  background: "#fafaf8",
  surface: "#ffffff",
  surface2: "#f3f3ee",

  foreground: "rgba(15, 20, 25, 0.92)",
  muted: "rgba(15, 20, 25, 0.55)",
  faint: "rgba(15, 20, 25, 0.35)",

  glass: "rgba(15, 20, 25, 0.04)",
  glassStrong: "rgba(15, 20, 25, 0.07)",
  glassBorder: "rgba(15, 20, 25, 0.10)",
  glassAndroid: "rgba(255, 255, 255, 0.95)",

  accent: "#2e5b42",
  accentSoft: "rgba(46, 91, 66, 0.12)",
  accentLight: "#4a8c6b",

  header: "#1f4030",
  headerForeground: "rgba(255, 255, 255, 0.95)",
  headerMuted: "rgba(255, 255, 255, 0.6)",

  danger: "#dc2626",
  dangerSoft: "rgba(220, 38, 38, 0.10)",
  warning: "#d97706",
  warningSoft: "rgba(217, 119, 6, 0.10)",
  success: "#16a34a",
  successSoft: "rgba(22, 163, 74, 0.10)",

  divider: "rgba(15, 20, 25, 0.08)",
};

const darkTokens: ThemeTokens = {
  // Neutral near-black — slightly off pure #000 so glass surfaces still read
  // as raised. Was #0A0F14 / hsl(210°…) which carried a cool blue cast.
  background: "#0E0E10",
  surface: "hsl(0, 0%, 11%)",
  surface2: "hsl(0, 0%, 15%)",

  foreground: "rgba(255, 255, 255, 0.92)",
  muted: "rgba(255, 255, 255, 0.55)",
  faint: "rgba(255, 255, 255, 0.35)",

  glass: "rgba(255, 255, 255, 0.05)",
  glassStrong: "rgba(255, 255, 255, 0.08)",
  glassBorder: "rgba(255, 255, 255, 0.10)",
  glassAndroid: "rgba(26, 26, 28, 0.95)",

  accent: "#2e5b42",
  accentSoft: "rgba(46, 91, 66, 0.18)",
  accentLight: "#5aa07e",

  header: "#14291e",
  headerForeground: "rgba(255, 255, 255, 0.95)",
  headerMuted: "rgba(255, 255, 255, 0.6)",

  danger: "#ef4444",
  dangerSoft: "rgba(239, 68, 68, 0.12)",
  warning: "#f59e0b",
  warningSoft: "rgba(245, 158, 11, 0.12)",
  success: "#22c55e",
  successSoft: "rgba(34, 197, 94, 0.12)",

  divider: "rgba(255, 255, 255, 0.08)",
};

export function useThemeTokens(): ThemeTokens {
  const { resolvedTheme } = useThemePreference();
  return resolvedTheme === "dark" ? darkTokens : lightTokens;
}

export const themeTokens = { light: lightTokens, dark: darkTokens };
