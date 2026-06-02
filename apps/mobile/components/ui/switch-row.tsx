import React from "react";
import { Switch, Text, View } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";

/**
 * Canonical label-plus-toggle row for the studio. Centralises the two things
 * every ad-hoc Switch row kept getting wrong:
 *   - the track uses the studio accent (green) when on, not iOS system green;
 *   - the switch is scaled to 0.85 so it sits optically centered against the
 *     label baseline (the raw iOS Switch reads slightly high in a tall row).
 *
 * Label + optional hint sit on the left and flex; the switch is pinned right.
 */
export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  disabled,
  testID,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const tokens = useThemeTokens();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-foreground font-body-semibold"
          style={{ fontSize: 14, lineHeight: 18 }}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            className="text-muted"
            style={{ fontSize: 12, lineHeight: 16, paddingTop: 2 }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? label}
        trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </View>
  );
}
