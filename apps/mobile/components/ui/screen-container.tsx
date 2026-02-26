import React, { PropsWithChildren } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";
import { TAB_BAR_HEIGHT } from "./constants";

/** Wraps screen content with proper insets for transparent header + absolute tab bar. */
export function ScreenContainer({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 12;

  return (
    <YStack
      flex={1}
      bg="$background"
      px="$5"
      pb={TAB_BAR_HEIGHT + 16}
      gap="$5"
      style={{ paddingTop: topPadding }}
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
      style={{ paddingTop: topPadding, paddingBottom: TAB_BAR_HEIGHT }}
    >
      {children}
    </YStack>
  );
}

