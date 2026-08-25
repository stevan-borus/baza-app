/**
 * FilterChip — pill toggle with an ink-fill selected state and a
 * hairline-bordered ghost idle state. Theme-aware. Drop-in for the old
 * sage-on-bone chips that read poorly on the bone canvas.
 */
import React from "react";
import { Pressable, Text } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";

export function FilterChip({
  label,
  active,
  onPress,
  trailingIcon,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  trailingIcon?: IconName;
  testID?: string;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={active}
      android_ripple={null}
      className={`flex-row items-center px-3.5 py-2 rounded-full border active:opacity-80 ${
        active
          ? "bg-foreground border-foreground"
          : "border-glass-border"
      }`}
      style={{ gap: 6 }}
    >
      <Text
        className={
          active
            ? "text-background font-body-semibold"
            : "text-muted font-body-medium"
        }
        style={{ fontSize: 13, letterSpacing: 0.1 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailingIcon ? (
        <Icon
          name={trailingIcon}
          size={trailingIcon === "times" ? 11 : 10}
          color={active ? tokens.background : tokens.faint}
        />
      ) : null}
    </Pressable>
  );
}
