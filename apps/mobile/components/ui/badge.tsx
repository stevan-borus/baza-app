import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

type Status = "success" | "warning" | "danger" | "neutral";

type BadgeProps = {
  status?: Status;
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
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

export function Badge({
  status = "neutral",
  children,
  testID,
  style,
}: BadgeProps) {
  return (
    <View
      testID={testID}
      style={style}
      className={`px-2.5 py-1 rounded-full ${bgClass[status]}`}
    >
      <Text className={`text-xs font-body-semibold ${fgClass[status]}`}>
        {children}
      </Text>
    </View>
  );
}
