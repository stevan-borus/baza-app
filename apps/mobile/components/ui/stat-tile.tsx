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
      <View className="gap-2" style={{ minHeight: 92 }}>
        <View className="flex-row items-start justify-between" style={{ minHeight: 32 }}>
          <Text
            className="text-xs font-body-semibold uppercase tracking-wider text-muted flex-1"
            numberOfLines={2}
            style={{ lineHeight: 14 }}
          >
            {label}
          </Text>
          {icon}
        </View>
        <Text
          className="text-[28px] font-body-bold text-foreground"
          style={{ letterSpacing: -0.5 }}
        >
          {value}
        </Text>
        {delta ? (
          <Text
            className={`text-xs font-body-semibold ${delta.positive ? "text-success" : "text-danger"}`}
          >
            {delta.positive ? "▲" : "▼"} {delta.value}
          </Text>
        ) : null}
      </View>
    </GlassCard>
  );
}
