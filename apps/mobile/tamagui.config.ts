import { createAnimations } from "@tamagui/animations-react-native";
import { green, greenDark, red, redDark, yellow, yellowDark } from "@tamagui/colors";
import { createV5Theme, defaultChildrenThemes, defaultConfig, v5ComponentThemes } from "@tamagui/config/v5";
import { createFont, createTamagui } from "@tamagui/core";

// Warm off-white light palette (hue 30°)
const lightPalette = [
  "hsla(30, 25%, 98%, 1)",  // background
  "hsla(30, 16%, 92%, 1)",  // color2 - card surface (visible lift from bg)
  "hsla(30, 14%, 88%, 1)",
  "hsla(30, 12%, 83%, 1)",
  "hsla(30, 10%, 78%, 1)",
  "hsla(30, 8%, 70%, 1)",
  "hsla(30, 7%, 62%, 1)",
  "hsla(30, 6%, 55%, 1)",
  "hsla(30, 4%, 47%, 1)",
  "hsla(30, 3%, 40%, 1)",
  "hsla(30, 5%, 12%, 1)",   // color11 - near-black text
  "hsla(30, 8%, 6%, 1)",    // color12
];

// Neutral dark palette — #0A0F14 base with clear surface elevation
const darkPalette = [
  "#0A0F14",                 // background - deep neutral dark
  "hsla(210, 15%, 11%, 1)", // color2 - card surface (clear lift from bg)
  "hsla(210, 12%, 15%, 1)", // color3 - elevated surface / hover
  "hsla(210, 10%, 19%, 1)",
  "hsla(210, 8%, 24%, 1)",
  "hsla(210, 6%, 30%, 1)",
  "hsla(210, 5%, 40%, 1)",
  "hsla(210, 4%, 50%, 1)",
  "hsla(0, 0%, 65%, 1)",
  "hsla(0, 0%, 78%, 1)",
  "hsla(0, 0%, 100%, 1)",   // color11 - pure white text
  "hsla(0, 0%, 100%, 1)",   // color12 - pure white
];

// Proper forest-green accent gradient (12 steps) — maintains green hue throughout
const accentLight = {
  accent1: "hsla(151, 33%, 27%, 1)",   // brand forest green #2e5b42
  accent2: "hsla(151, 30%, 30%, 1)",
  accent3: "hsla(151, 28%, 34%, 1)",
  accent4: "hsla(151, 25%, 38%, 1)",
  accent5: "hsla(151, 22%, 42%, 1)",
  accent6: "hsla(151, 20%, 47%, 1)",
  accent7: "hsla(151, 18%, 52%, 1)",
  accent8: "hsla(151, 16%, 58%, 1)",
  accent9: "hsla(151, 14%, 64%, 1)",
  accent10: "hsla(151, 12%, 72%, 1)",
  accent11: "hsla(151, 10%, 85%, 1)",
  accent12: "hsla(151, 8%, 95%, 1)",
} as const;

// Dark mode accent — same brand green + lighter variant for readability
const accentDark = {
  accent1: "hsla(151, 33%, 27%, 1)",   // #2e5b42 - same brand green
  accent2: "hsla(151, 30%, 30%, 1)",
  accent3: "hsla(151, 28%, 34%, 1)",
  accent4: "hsla(151, 25%, 38%, 1)",
  accent5: "hsla(151, 22%, 42%, 1)",
  accent6: "hsla(151, 20%, 47%, 1)",
  accent7: "hsla(151, 18%, 52%, 1)",   // #4a8c6b - accent light variant
  accent8: "hsla(151, 16%, 58%, 1)",
  accent9: "hsla(151, 14%, 64%, 1)",
  accent10: "hsla(151, 12%, 72%, 1)",
  accent11: "hsla(151, 10%, 85%, 1)",
  accent12: "hsla(151, 8%, 95%, 1)",
} as const;

const builtThemes = createV5Theme({
  darkPalette,
  lightPalette,
  componentThemes: v5ComponentThemes,
  accent: {
    light: accentLight,
    dark: accentDark,
  },
  childrenThemes: {
    ...defaultChildrenThemes,
    warning: { light: yellow, dark: yellowDark },
    error: { light: red, dark: redDark },
    success: { light: green, dark: greenDark },
  },
});

export type Themes = typeof builtThemes;

// On production client bundles, Tamagui can hydrate themes from CSS instead of shipping theme JS.
export const themes: Themes =
  process.env.TAMAGUI_ENVIRONMENT === "client" && process.env.NODE_ENV === "production"
    ? ({} as Themes)
    : builtThemes;

const inter = createFont({
  family: "Inter",
  size: {
    1: 11,
    2: 13,
    3: 15,
    4: 17,
    5: 20,
    6: 24,
    7: 30,
    8: 36,
    9: 40,
    10: 48,
    true: 15,
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 22,
    4: 24,
    5: 28,
    6: 32,
    7: 38,
    8: 44,
    9: 48,
    10: 56,
    true: 22,
  },
  weight: {
    3: "300",
    4: "400",
    5: "500",
    6: "600",
    7: "700",
    8: "800",
    true: "400",
  },
  letterSpacing: {
    4: 0,
    5: -0.2,
    6: -0.3,
    7: -0.4,
    8: -0.5,
    9: -0.8,
    10: -1.0,
    true: 0,
  },
});

export const navigationThemeColors = {
  light: {
    background: builtThemes.light.background ?? lightPalette[0],
    card: builtThemes.light.background ?? lightPalette[0],
    text: builtThemes.light.color ?? lightPalette[11],
    border: builtThemes.light.borderColor ?? lightPalette[4],
    primary: accentLight.accent1,
    notification: builtThemes.light.red10,
  },
  dark: {
    background: "#0A0F14",
    card: "#0A0F14",
    text: darkPalette[11],
    border: darkPalette[4],
    primary: accentDark.accent1,
    notification: builtThemes.dark.red10,
  },
} as const;

const config = createTamagui({
  ...defaultConfig,
  themes,
  media: {
    sm: { maxWidth: 640 },
    md: { maxWidth: 1024 },
    lg: { minWidth: 1025 },
  },
  shorthands: {
    ...defaultConfig.shorthands,
    f: "flex",
    ai: "alignItems",
    jc: "justifyContent",
  },
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
  },
  fonts: {
    ...defaultConfig.fonts,
    body: inter,
    heading: inter,
  },
  animations: createAnimations({
    bouncy: {
      damping: 10,
      mass: 0.9,
      stiffness: 100,
    },
    lazy: {
      damping: 18,
      stiffness: 50,
    },
    quick: {
      damping: 20,
      mass: 1.2,
      stiffness: 250,
    },
    gentle: {
      damping: 15,
      mass: 0.8,
      stiffness: 120,
    },
    snappy: {
      damping: 22,
      mass: 0.6,
      stiffness: 300,
    },
    fade: {
      damping: 20,
      stiffness: 80,
    },
    springy: {
      damping: 8,
      mass: 0.7,
      stiffness: 150,
    },
  }),
});

export type AppTamaguiConfig = typeof config;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

declare module "@tamagui/core" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default config;
