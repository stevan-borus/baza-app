import React from "react";
import { Text, View } from "react-native";
import { GlassCard } from "./glass-card";

type StatTileProps = {
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  icon?: React.ReactNode;
};

export function StatTile({ label, value, delta, icon }: StatTileProps) {
  return (
    <GlassCard size="sm">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider">
            {label}
          </Text>
          {icon}
        </View>
        <Text
          className="text-[28px] font-bold text-foreground"
          style={{ letterSpacing: -0.5 }}
        >
          {value}
        </Text>
        {delta ? (
          <Text
            className={`text-xs font-semibold ${
              delta.positive ? "text-success" : "text-danger"
            }`}
          >
            {delta.positive ? "▲" : "▼"} {delta.value}
          </Text>
        ) : null}
      </View>
    </GlassCard>
  );
}
