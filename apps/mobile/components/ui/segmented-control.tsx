import React from "react";
import { Pressable, Text, View } from "react-native";
import { MotiView } from "moti";

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View className="flex-row bg-glass border border-glass-border rounded-2xl p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className="flex-1 py-2 rounded-xl relative items-center"
          >
            {active ? (
              <MotiView
                from={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 180 }}
                className="absolute inset-0 bg-accent rounded-xl"
              />
            ) : null}
            <Text
              className={`text-sm font-semibold ${
                active ? "text-white" : "text-muted"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
