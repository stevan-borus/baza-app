import React from "react";
import {
  View,
  Image,
  Pressable,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Icon, type IconName } from "@/components/ui/icon";
import { useRouter } from "expo-router";
import { useThemeTokens } from "./tokens";
import { useThemePreference } from "@/lib/theme-preference";

// No fixed bar height — pad consistently top/bottom so the chrome matches
// the home tab's bespoke header (paddingTop/Bottom: 14 around 32pt logo).
// Swap logo by theme so the wordmark stays legible: forest-green PNG on
// bone, white PNG on warm dark.
const LOGO_BAZA_INK = require("@/assets/studio/baza-logo.webp");
const LOGO_BAZA_CREAM = require("@/assets/studio/baza-logo-white.webp");

export type AppHeaderProps = {
  /** Centered title — kept for API compatibility but the logo lockup
   * replaces it visually. Screens should render any per-screen title in
   * their own body content. */
  title?: string;
  /** Slot rendered top-left. Defaults to nothing — pass `<UserAvatar />`
   * for tab screens or `<BackButton />` for detail screens. */
  leftSlot?: React.ReactNode;
  /** Slot rendered top-right (e.g. a `+` action). */
  rightSlot?: React.ReactNode;
} & Pick<ViewProps, "testID">;

/**
 * Studio app header — bone canvas with the Baza logo lockup centered.
 * No green chrome, no blur material. The logo IS the header.
 */
export function AppHeader({
  leftSlot,
  rightSlot,
  testID,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useThemePreference();

  return (
    <View className="bg-background" testID={testID}>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />

      {/* Top safe area painted bone */}
      <View style={{ height: insets.top }} />

      {/* Header bar — matches the home tab: 14pt top/bottom padding around
          the 32pt logo, no fixed bar height.

          The logo must stay screen-centered regardless of slot contents. The
          two side slots each take equal flex (flex: 1), so the logo — the
          fixed-width middle item — always lands at the true center even when
          one slot is wider (e.g. a two-icon right slot vs. a one-icon left). */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {/* Left slot — equal flex, content aligned to the start edge */}
        <View style={{ flex: 1, alignItems: "flex-start", justifyContent: "center" }}>
          {leftSlot}
        </View>

        {/* Logo lockup — swap by theme so the wordmark always reads */}
        <Image
          source={resolvedTheme === "dark" ? LOGO_BAZA_CREAM : LOGO_BAZA_INK}
          style={{ width: 110, height: 32 }}
          resizeMode="contain"
        />

        {/* Right slot — equal flex mirrors the left, content aligned to the end
            edge. Equal flex on both sides is what keeps the logo centered. */}
        <View style={{ flex: 1, alignItems: "flex-end", justifyContent: "center" }}>
          {rightSlot}
        </View>
      </View>
    </View>
  );
}

/**
 * Back chevron for detail screens — ink stroke on bone.
 */
export function BackButton() {
  const router = useRouter();
  const tokens = useThemeTokens();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      android_ripple={null}
      className="active:opacity-60"
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Icon name="chevron-left" size={26} color={tokens.foreground} />
    </Pressable>
  );
}

/**
 * Right-side icon button — ink on bone, thin glyphs.
 */
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      android_ripple={null}
      className="active:opacity-60"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Icon name={icon} size={22} color={tokens.foreground} />
    </Pressable>
  );
}
