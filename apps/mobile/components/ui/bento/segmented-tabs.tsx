import React from "react";
import { View, Text, Pressable } from "react-native";
import { GLASS_BG, GLASS_BORDER } from "../tokens";

type BentoSegmentedTabsProps<T extends string> = {
  segments: Array<{ value: T; label: string }>;
  value: T;
  onValueChange: (value: T) => void;
  fullWidth?: boolean;
};

export function BentoSegmentedTabs<T extends string>({
  segments,
  value,
  onValueChange,
  fullWidth = true,
}: BentoSegmentedTabsProps<T>) {
  return (
    <View
      style={{
        backgroundColor: GLASS_BG,
        borderWidth: 1,
        borderColor: GLASS_BORDER,
        borderRadius: 14,
        padding: 4,
        flexDirection: "row",
      }}
    >
      {segments.map((segment) => {
        const isActive = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onValueChange(segment.value)}
            style={{
              flex: fullWidth ? 1 : undefined,
              minWidth: fullWidth ? undefined : 88,
              flexShrink: 0,
              backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: fullWidth ? 12 : 10,
              alignItems: "center",
            }}
          >
            <Text
              className={[
                isActive ? "font-semibold text-foreground" : "font-normal text-muted",
                fullWidth ? "text-xs" : "text-[11px]",
              ].join(" ")}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
