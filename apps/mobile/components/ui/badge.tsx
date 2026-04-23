import React from "react";
import { Text, View } from "react-native";

type Status = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  status?: Status;
  children: React.ReactNode;
};

const bgCls: Record<Status, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  neutral: "bg-glass",
};

const textCls: Record<Status, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted",
};

export function Badge({ status = "neutral", children }: BadgeProps) {
  return (
    <View className={`px-2.5 py-1 rounded-full ${bgCls[status]}`}>
      <Text className={`text-xs font-semibold ${textCls[status]}`}>{children}</Text>
    </View>
  );
}
