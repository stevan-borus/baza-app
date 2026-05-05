import { Platform } from "react-native";

/** Header (forest-green AppHeader) — its actual height is dynamic; only used
 * by legacy code that needed a hardcoded value. New code should not depend on
 * this. */
export const HEADER_HEIGHT = Platform.OS === "ios" ? 44 : 56;

/** Bottom tab bar height. The flat bar is 56pt + bottom safe-area inset; we
 * keep a single static value as a safe bottom-padding floor for screen
 * content. Specific screens that need exact insets should compose with
 * `useSafeAreaInsets()` directly. */
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 80 : 56;
