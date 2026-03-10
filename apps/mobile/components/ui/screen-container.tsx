import React, { PropsWithChildren } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";
import { TAB_BAR_HEIGHT } from "./constants";

const webConstraint =
  Platform.OS === "web"
    ? { maxWidth: 480, marginLeft: "auto" as const, marginRight: "auto" as const, width: "100%" as const }
    : {};

/** Wraps screen content with proper insets for transparent header + absolute tab bar. */
export function ScreenContainer({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <YStack
      flex={1}
      bg="$background"
      px="$6"
      pb={TAB_BAR_HEIGHT + 16}
      gap="$6"
      style={{ paddingTop: topPadding, ...webConstraint }}
    >
      {children}
    </YStack>
  );
}

/** Wraps full-height screen content (no ScrollView) with proper insets. */
export function ScreenContainerRaw({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <YStack
      flex={1}
      bg="$background"
      style={{ paddingTop: topPadding, paddingBottom: TAB_BAR_HEIGHT, ...webConstraint }}
    >
      {children}
    </YStack>
  );
}
