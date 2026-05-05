import React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useThemeTokens } from "./tokens";
import { useThemePreference } from "@/lib/theme-preference";

type Tone = "default" | "accent" | "warning";

type HeroCardProps = ViewProps & {
  tone?: Tone;
  children?: React.ReactNode;
};

export function HeroCard({
  tone = "default",
  className,
  children,
  style,
  ...rest
}: HeroCardProps) {
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();
  const isIOS = Platform.OS === "ios";
  const isDark = resolvedTheme === "dark";

  // Default tone uses an "ink-tint" gradient that flips per theme; accent
  // and warning keep their brand-color washes (look correct on both themes).
  const defaultGradient: [string, string] = isDark
    ? ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"]
    : ["rgba(15,20,25,0.06)", "rgba(15,20,25,0.02)"];
  const gradients: Record<Tone, [string, string]> = {
    default: defaultGradient,
    accent: ["rgba(46,91,66,0.45)", "rgba(46,91,66,0.15)"],
    warning: ["rgba(245,158,11,0.35)", "rgba(245,158,11,0.05)"],
  };

  return (
    <View
      className={`rounded-[28px] overflow-hidden border border-glass-border ${className ?? ""}`}
      style={style}
      {...rest}
    >
      {isIOS ? (
        <BlurView
          intensity={50}
          tint={isDark ? "dark" : "light"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      ) : (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: tokens.glassAndroid,
          }}
        />
      )}
      <LinearGradient
        colors={gradients[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View className="p-6">{children}</View>
    </View>
  );
}
