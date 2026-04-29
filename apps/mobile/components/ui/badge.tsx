import React from "react";
import { Text, View } from "react-native";

type Status = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  status?: Status;
  children: React.ReactNode;
};

const bgClass: Record<Status, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  neutral: "bg-glass",
};

const fgClass: Record<Status, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted",
};

export function Badge({ status = "neutral", children }: BadgeProps) {
  return (
    <View className={`px-2.5 py-1 rounded-full ${bgClass[status]}`}>
      <Text className={`text-xs font-body-semibold ${fgClass[status]}`}>
        {children}
      </Text>
    </View>
  );
}
