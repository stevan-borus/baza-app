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
  // Studio palette — warm bone canvas, near-black ink, single accent.
  // `surface` is a slightly warmer + lighter shade of the canvas (not
  // pure white) so cards read as quiet embedded chrome on bone.
  background: "#F4EFE3",
  surface: "#FBF7EC",
  surface2: "#EBE5D5",

  foreground: "#0F0F0D",
  muted: "rgba(15, 15, 13, 0.62)",
  faint: "rgba(15, 15, 13, 0.38)",

  glass: "rgba(15, 15, 13, 0.04)",
  glassStrong: "rgba(15, 15, 13, 0.07)",
  glassBorder: "rgba(15, 15, 13, 0.10)",
  glassAndroid: "rgba(255, 255, 255, 0.95)",

  accent: "#2e5b42",
  accentSoft: "rgba(46, 91, 66, 0.12)",
  accentLight: "#4a8c6b",

  // Header is the bone canvas — no green chrome.
  header: "#F4EFE3",
  headerForeground: "#0F0F0D",
  headerMuted: "rgba(15, 15, 13, 0.55)",

  danger: "#dc2626",
  dangerSoft: "rgba(220, 38, 38, 0.10)",
  warning: "#d97706",
  warningSoft: "rgba(217, 119, 6, 0.10)",
  success: "#16a34a",
  successSoft: "rgba(22, 163, 74, 0.10)",

  divider: "rgba(15, 15, 13, 0.10)",
};

const darkTokens: ThemeTokens = {
  // Warm spa dark — soft neutral with a faint warm undertone so cream
  // text never glows on pure black. Mirrors the @layer theme dark variant
  // in global.css.
  background: "#1A1A1C",
  surface: "#232325",
  surface2: "#2C2C2E",

  foreground: "#EDE8DC",
  muted: "rgba(237, 232, 220, 0.62)",
  faint: "rgba(237, 232, 220, 0.38)",

  glass: "rgba(237, 232, 220, 0.05)",
  glassStrong: "rgba(237, 232, 220, 0.08)",
  glassBorder: "rgba(237, 232, 220, 0.12)",
  glassAndroid: "rgba(35, 35, 37, 0.95)",

  accent: "#2e5b42",
  accentSoft: "rgba(46, 91, 66, 0.22)",
  accentLight: "#7AA88E",

  header: "#1A1A1C",
  headerForeground: "#EDE8DC",
  headerMuted: "rgba(237, 232, 220, 0.62)",

  danger: "#f87171",
  dangerSoft: "rgba(248, 113, 113, 0.14)",
  warning: "#fbbf24",
  warningSoft: "rgba(251, 191, 36, 0.14)",
  success: "#4ade80",
  successSoft: "rgba(74, 222, 128, 0.14)",

  divider: "rgba(237, 232, 220, 0.10)",
};

export function useThemeTokens(): ThemeTokens {
  const { resolvedTheme } = useThemePreference();
  return resolvedTheme === "dark" ? darkTokens : lightTokens;
}

export const themeTokens = { light: lightTokens, dark: darkTokens };
