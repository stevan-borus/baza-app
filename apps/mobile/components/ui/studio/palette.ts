/**
 * Studio palette — the single source of truth for the new visual system.
 *
 * Most screens should use Tailwind utilities (`bg-background`, `text-foreground`)
 * which are token-driven and flip with the theme. These constants are for the
 * places that need exact hex values: gradients, ImageBackground overlays,
 * StatusBar, native chrome, etc.
 */

export const STUDIO = {
  bg: "#F4EFE3",
  surface: "#FFFFFF",
  surface2: "#EBE5D5",

  ink: "#0F0F0D",
  inkSoft: "rgba(15,15,13,0.62)",
  inkFaint: "rgba(15,15,13,0.38)",
  hairline: "rgba(15,15,13,0.10)",

  accent: "#2e5b42",
  accentSoft: "rgba(46,91,66,0.12)",
  accentLightOnDark: "#9ED6B5", // sage glow for dark photo overlays

  // Reserved for warning/expiry state on a dark surface
  warningOnDark: "#FFD79A",
} as const;
