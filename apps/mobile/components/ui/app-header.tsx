import React from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useThemeTokens } from "./tokens";

const HEADER_BAR_HEIGHT = 52;

export type AppHeaderProps = {
  /** Centered title. */
  title: string;
  /** Slot rendered top-left. Defaults to nothing — pass `<UserAvatar />` for tab screens or `<BackButton />` for detail screens. */
  leftSlot?: React.ReactNode;
  /** Slot rendered top-right (e.g. a `+` action). */
  rightSlot?: React.ReactNode;
} & Pick<ViewProps, "testID">;

/**
 * Forest-green opaque app header. Renders the safe-area top inset + a fixed
 * 52pt bar with three slots (left / center title / right). On iOS it adds a
 * subtle BlurView overlay for depth.
 *
 * Pair with `headerShown: false` on the underlying navigator.
 */
export function AppHeader({ title, leftSlot, rightSlot, testID }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();

  return (
    <View style={{ backgroundColor: tokens.header }} testID={testID}>
      {/* Status bar text is always white over the forest-green band */}
      <StatusBar style="light" />

      {/* Optional iOS BlurView overlay for material depth */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={20}
          tint="dark"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {/* Top safe area painted in header color */}
      <View style={{ height: insets.top }} />

      {/* Header bar */}
      <View
        style={{ height: HEADER_BAR_HEIGHT }}
        className="flex-row items-center px-4"
      >
        {/* Left slot — fixed 40pt so center title stays centered */}
        <View style={{ width: 40 }} className="items-start justify-center">
          {leftSlot}
        </View>

        {/* Title */}
        <View className="flex-1 items-center justify-center">
          <Text
            numberOfLines={1}
            className="font-display"
            style={{
              color: tokens.headerForeground,
              fontSize: 18,
              letterSpacing: -0.2,
            }}
          >
            {title}
          </Text>
        </View>

        {/* Right slot — fixed 40pt mirror */}
        <View style={{ width: 40 }} className="items-end justify-center">
          {rightSlot}
        </View>
      </View>

      {/* Hairline bottom border */}
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: "rgba(255,255,255,0.10)",
        }}
      />
    </View>
  );
}

/**
 * Back chevron for detail screens. Pops the current navigator.
 * Uses Feather (thin stroke) instead of FontAwesome (heavy glyph).
 */
export function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Feather name="chevron-left" size={24} color="rgba(255,255,255,0.95)" />
    </Pressable>
  );
}

/**
 * Right-side icon button (e.g. `+` to create a new resource). Maps a
 * FontAwesome-style name to a thinner Feather equivalent for header glyphs.
 */
type FeatherName = React.ComponentProps<typeof Feather>["name"];
type FontAwesomeName = React.ComponentProps<typeof FontAwesome>["name"];

const FA_TO_FEATHER: Partial<Record<FontAwesomeName, FeatherName>> = {
  plus: "plus",
  cog: "settings",
  pencil: "edit-2",
  trash: "trash-2",
  search: "search",
  filter: "filter",
  bell: "bell",
  envelope: "mail",
  calendar: "calendar",
  user: "user",
  users: "users",
  archive: "archive",
  "credit-card": "credit-card",
  "bar-chart": "bar-chart-2",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
};

export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: FontAwesomeName;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const featherName = FA_TO_FEATHER[icon];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {featherName ? (
        <Feather name={featherName} size={22} color="rgba(255,255,255,0.95)" />
      ) : (
        <FontAwesome name={icon} size={20} color="rgba(255,255,255,0.95)" />
      )}
    </Pressable>
  );
}
