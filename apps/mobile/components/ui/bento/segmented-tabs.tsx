import React from "react";
import { Tabs, Text } from "tamagui";
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
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      orientation="horizontal"
    >
      <Tabs.List bg={GLASS_BG} borderWidth={1} borderColor={GLASS_BORDER} rounded={14} p="$1">
        {segments.map((segment) => {
          const isActive = segment.value === value;
          return (
            <Tabs.Tab
              key={segment.value}
              value={segment.value}
              bg={isActive ? "rgba(255,255,255,0.1)" : "transparent"}
              rounded={12}
              py="$2"
              px={fullWidth ? "$3" : "$2.5"}
              flex={fullWidth ? 1 : undefined}
              minWidth={fullWidth ? undefined : 88}
              flexShrink={0}
            >
              <Text
                fontSize={fullWidth ? "$2" : "$1"}
                fontWeight={isActive ? "600" : "400"}
                color={isActive ? "$color" : "$color10"}
              >
                {segment.label}
              </Text>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
