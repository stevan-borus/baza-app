import React from "react";
import { Tabs, Text } from "tamagui";
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
    <Tabs value={value} onValueChange={onValueChange}>
      <Tabs.List bg={GLASS_BG} borderWidth={1} borderColor={GLASS_BORDER} rounded={14} p="$1">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            bg={value === tab.value ? "rgba(255,255,255,0.1)" : "transparent"}
            rounded={12}
            py="$2"
            px="$3"
          >
            <Text
              fontWeight={value === tab.value ? "600" : "400"}
              color={value === tab.value ? "$color" : "$color10"}
              fontSize="$2"
            >
              {tab.label}
            </Text>
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
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
