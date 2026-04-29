import React from "react";
import { View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ACCENT } from "../tokens";

type StatChipProps = {
  label: string;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor?: string;
};

export function BentoStatChip({ label, icon, accentColor }: StatChipProps) {
  return (
    <View className="flex-row items-center gap-2">
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: accentColor ?? ACCENT,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FontAwesome name={icon} size={18} color="#ffffff" />
        </View>
      ) : null}
      <Text className="text-xs text-muted font-body-medium flex-1">
        {label}
      </Text>
    </View>
  );
}
