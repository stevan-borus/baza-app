import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { BentoSegmentedTabs } from "./bento/segmented-tabs";
import { GLASS_BG, GLASS_BORDER } from "./tokens";

export function AppTabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
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
      {tabs.map((tab) => {
        const isActive = value === tab.value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onValueChange(tab.value)}
            style={{
              flex: 1,
              backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
              alignItems: "center",
            }}
          >
            <Text
              className={[
                "text-xs",
                isActive ? "font-semibold text-foreground" : "font-normal text-muted",
              ].join(" ")}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bento-inspired segmented tabs for switching between compact views. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onValueChange,
  fullWidth = true,
}: {
  segments: Array<{ value: T; label: string }>;
  value: T;
  onValueChange: (value: T) => void;
  fullWidth?: boolean;
}) {
  return (
    <BentoSegmentedTabs
      segments={segments}
      value={value}
      onValueChange={onValueChange}
      fullWidth={fullWidth}
    />
  );
}
