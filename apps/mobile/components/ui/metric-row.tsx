import React from "react";
import { Text, View } from "react-native";

type Props = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
};

export function MetricRow({ label, value, icon }: Props) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-glass-border">
      <View className="flex-row items-center gap-3">
        {icon}
        <Text className="text-sm text-muted">{label}</Text>
      </View>
      <Text className="font-body-medium text-sm text-foreground">{value}</Text>
    </View>
  );
}
