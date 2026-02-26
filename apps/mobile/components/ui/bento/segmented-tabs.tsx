import React from "react";
import { Tabs, Text } from "tamagui";

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
      <Tabs.List bg="$backgroundHover" rounded={10} p="$1">
        {segments.map((segment) => {
          const isActive = segment.value === value;
          return (
            <Tabs.Tab
              key={segment.value}
              value={segment.value}
              bg={isActive ? "$background" : "transparent"}
              rounded={8}
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

