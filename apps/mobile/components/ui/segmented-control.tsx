import React from "react";
import { Pressable, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";

/**
 * Unified segmented control. Renders a horizontal row of pill segments with
 * a forest-green accent fill on the active segment.
 *
 * Two equivalent APIs are supported for backwards compat:
 *   - `options` + `onChange` (legacy)
 *   - `segments` + `onValueChange` (modern)
 *
 * New callers should use `segments` + `onValueChange`.
 */
type Segment<T extends string> = { value: T; label: string; testID?: string };

type SegmentedControlProps<T extends string> = {
  value: T;
  /** When true (default), each segment is `flex: 1` and the strip fills its parent. */
  fullWidth?: boolean;
} & (
  | { options: Segment<T>[]; segments?: never; onChange: (value: T) => void; onValueChange?: never }
  | { segments: Segment<T>[]; options?: never; onValueChange: (value: T) => void; onChange?: never }
);

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { value, fullWidth = true } = props;
  const segments = "options" in props && props.options ? props.options : props.segments!;
  const handleChange = (next: T) => {
    if ("onChange" in props && props.onChange) props.onChange(next);
    else if ("onValueChange" in props && props.onValueChange) props.onValueChange(next);
  };

  return (
    <View className="flex-row rounded-2xl p-1 border bg-glass border-glass-border">
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            testID={seg.testID}
            onPress={() => handleChange(seg.value)}
            className={`${fullWidth ? "flex-1" : ""} py-2 px-3 rounded-xl relative items-center`}
          >
            {active ? (
              <MotiView
                from={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 180 }}
                className="absolute inset-0 rounded-xl bg-accent"
              />
            ) : null}
            <Text
              className={`text-sm font-body-semibold ${active ? "text-white" : "text-muted"}`}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
