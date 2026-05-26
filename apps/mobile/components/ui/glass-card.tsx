import React from "react";
import { View, Platform, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { useThemeTokens } from "./tokens";
import { useThemePreference } from "@/lib/theme-preference";

type AccentBorder = "left" | "top";
type CardSize = "sm" | "md" | "lg";

export type GlassCardProps = ViewProps & {
  accentBorder?: AccentBorder;
  /** Override the accent border color (hex/rgb string). Defaults to #2e5b42. */
  accentBorderColor?: string;
  interactive?: boolean;
  size?: CardSize;
  /**
   * Skip the iOS BlurView overlay. Use this when the card sits on a
   * chromatic tint (via `style.backgroundColor`) where the blur would
   * wash out the color. Defaults to `false`.
   */
  noBlur?: boolean;
  children?: React.ReactNode;
};

const sizePadding: Record<CardSize, number> = {
  sm: 12,
  md: 16,
  lg: 20,
};

const sizeBorderRadius: Record<CardSize, number> = {
  sm: 16,
  md: 20,
  lg: 22,
};

export function GlassCard({
  children,
  style,
  accentBorder,
  accentBorderColor = "#2e5b42",
  interactive: _interactive,
  size = "lg",
  noBlur = false,
  ...props
}: GlassCardProps) {
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";

  const padding = sizePadding[size];
  const borderRadius = sizeBorderRadius[size];

  const platformBg = isAndroid
    ? tokens.glassAndroid
    : isWeb
      ? tokens.glass
      : "transparent";

  const webExtra = isWeb ? { backdropFilter: "blur(12px)" } : {};

  const accentBorderStyle =
    accentBorder === "left"
      ? { borderLeftWidth: 3, borderLeftColor: accentBorderColor }
      : accentBorder === "top"
        ? { borderTopWidth: 3, borderTopColor: accentBorderColor }
        : {};

  return (
    <View
      style={[
        {
          borderRadius,
          borderWidth: 1,
          borderColor: tokens.glassBorder,
          overflow: "hidden",
          padding,
          position: "relative",
          backgroundColor: platformBg,
          ...webExtra,
          ...accentBorderStyle,
        },
        style,
      ]}
      {...props}
    >
      {isIOS && !noBlur && (
        <BlurView
          intensity={40}
          tint={resolvedTheme === "dark" ? "dark" : "light"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
      {children}
    </View>
  );
}
