import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { useThemeTokens } from "./tokens";

/** Compact action row -- icon + label, used for secondary actions. */
export function ActionButton({
  icon,
  label,
  onPress,
  variant = "default",
  disabled,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  const tokens = useThemeTokens();
  const startsWithPlus = label.trim().startsWith("+");
  const displayLabel = startsWithPlus ? label.trim().replace(/^\+\s*/, "") : label;
  const showIcon = icon && !(icon === "plus" && startsWithPlus);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <View
        className={[
          "flex-row items-center rounded-xl px-3.5 py-2.5 gap-2",
          variant === "danger" ? "bg-danger-soft" : "bg-glass",
        ].join(" ")}
      >
        {showIcon && icon ? (
          <Icon
            name={icon}
            size={14}
            color={variant === "danger" ? tokens.danger : tokens.foreground}
          />
        ) : null}
        <Text
          className={[
            "text-sm font-body-medium",
            variant === "danger" ? "text-danger" : "text-foreground",
          ].join(" ")}
        >
          {displayLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
