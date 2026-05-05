import React from "react";
import { Text, View } from "react-native";

type Props = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  valueTestID?: string;
};

export function MetricRow({ label, value, icon, valueTestID }: Props) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-glass-border">
      <View className="flex-row items-center gap-3">
        {icon}
        <Text className="text-sm text-muted">{label}</Text>
      </View>
      <Text testID={valueTestID} className="font-body-medium text-sm text-foreground">
        {value}
      </Text>
    </View>
  );
}
