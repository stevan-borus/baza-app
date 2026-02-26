import { createAnimations } from "@tamagui/animations-react-native";
import { green, greenDark, red, redDark, yellow, yellowDark } from "@tamagui/colors";
import { createV5Theme, defaultChildrenThemes, defaultConfig, v5ComponentThemes } from "@tamagui/config/v5";
import { createFont, createTamagui } from "@tamagui/core";

const darkPalette = ["hsla(0, 0%, 0%, 1)", "hsla(0, 0%, 5%, 1)", "hsla(0, 0%, 10%, 1)", "hsla(0, 0%, 16%, 1)", "hsla(0, 0%, 22%, 1)", "hsla(0, 0%, 29%, 1)", "hsla(0, 0%, 35%, 1)", "hsla(0, 0%, 42%, 1)", "hsla(0, 0%, 48%, 1)", "hsla(0, 0%, 55%, 1)", "hsla(0, 0%, 94%, 1)", "hsla(0, 0%, 100%, 1)"];
const lightPalette = ["hsla(0, 0%, 100%, 1)", "hsla(0, 0%, 96%, 1)", "hsla(0, 0%, 92%, 1)", "hsla(0, 0%, 87%, 1)", "hsla(0, 0%, 82%, 1)", "hsla(0, 0%, 75%, 1)", "hsla(0, 0%, 67%, 1)", "hsla(0, 0%, 60%, 1)", "hsla(0, 0%, 52%, 1)", "hsla(0, 0%, 45%, 1)", "hsla(0, 0%, 8%, 1)", "hsla(0, 0%, 0%, 1)"];

const accentLight = {
  accent1: "hsla(151, 33%, 24%, 1)",
  accent2: "hsla(151, 22%, 24%, 1)",
  accent3: "hsla(151, 11%, 25%, 1)",
  accent4: "hsla(151, 0%, 25%, 1)",
  accent5: "hsla(121, 0%, 30%, 1)",
  accent6: "hsla(91, 0%, 35%, 1)",
  accent7: "hsla(60, 0%, 40%, 1)",
  accent8: "hsla(30, 0%, 45%, 1)",
  accent9: "hsla(0, 0%, 50%, 1)",
  accent10: "hsla(0, 0%, 88%, 1)",
  accent11: "hsla(0, 0%, 94%, 1)",
  accent12: "hsla(0, 0%, 100%, 1)",
} as const;

const accentDark = {
  ...accentLight,
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
    true: 0,
  },
});

export const navigationThemeColors = {
  light: {
    background: builtThemes.light.background,
    card: builtThemes.light.background,
    text: builtThemes.light.color,
    border: builtThemes.light.borderColor,
    primary: accentLight.accent1,
    notification: builtThemes.light.red10,
  },
  dark: {
    background: builtThemes.dark.background,
    card: builtThemes.dark.background,
    text: builtThemes.dark.color,
    border: builtThemes.dark.borderColor,
    primary: accentDark.accent1,
    notification: builtThemes.dark.red10,
  },
} as const;

const config = createTamagui({
  ...defaultConfig,
  themes,
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
