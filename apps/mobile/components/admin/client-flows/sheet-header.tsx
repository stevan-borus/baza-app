// Shared header for the stacked client-flow sheets (edit / assign / pause).
// Moved verbatim from app/(admin)/klijenti/index.tsx during the client-flows
// extraction — same markup, same hardcoded "Back" a11y label.

import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";

/**
 * SheetHeader — back chevron on the left of the sheet title. The chevron
 * goes "back" to the actions sheet (the previous step in the user's flow);
 * the standard sheet swipe-down still dismisses entirely.
 *
 * `onBack` is optional: flows opened from a surface with no previous sheet
 * step (the client-detail screen) omit it, and the header degrades to the
 * bare title Text those sheets rendered before the dedupe — no chevron, no
 * row wrapper, so the markup stays byte-identical to the pre-shared version.
 */
export function SheetHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  const t = useThemeTokens();
  if (!onBack) {
    return (
      <Text
        className="text-foreground font-body-bold"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2 -ml-1">
      <Pressable
        onPress={onBack}
        hitSlop={12}
        android_ripple={null}
        className="active:opacity-60 w-8 h-8 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="chevron-left" size={22} color={t.foreground} />
      </Pressable>
      <Text
        className="text-foreground font-body-bold flex-1"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
    </View>
  );
}
