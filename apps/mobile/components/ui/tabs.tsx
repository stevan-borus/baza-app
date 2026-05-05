/**
 * Re-exports the unified SegmentedControl plus the AppTabs component for
 * scrollable, larger tab strips. Callers in older code paths import
 * `SegmentedControl` from this file with the modern `segments`/`onValueChange`
 * API; that path still works since the unified control supports both APIs.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";

export { SegmentedControl } from "./segmented-control";

/**
 * Larger pill-tabs row (used at the top of list screens to switch between
 * datasets, e.g. Clients/Invites). Visually distinct from SegmentedControl —
 * a softer glass background with a brighter active pill, no accent fill.
 */
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
    <View className="flex-row rounded-[14px] p-1 border bg-glass border-glass-border">
      {tabs.map((tab) => {
        const isActive = value === tab.value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onValueChange(tab.value)}
            className={`flex-1 rounded-xl py-2 px-3 items-center ${isActive ? "bg-glass-strong" : ""}`}
          >
            <Text
              className={[
                "text-xs",
                isActive ? "font-body-semibold text-foreground" : "font-normal text-muted",
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
