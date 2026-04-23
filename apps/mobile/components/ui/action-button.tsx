import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DANGER } from "./tokens";

/** Compact action row -- icon + label, used for secondary actions. */
export function ActionButton({
  icon,
  label,
  onPress,
  variant = "default",
  disabled,
}: {
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
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
        {showIcon ? (
          <FontAwesome
            name={icon}
            size={14}
            color={variant === "danger" ? DANGER : undefined}
          />
        ) : null}
        <Text
          className={[
            "text-sm font-medium",
            variant === "danger" ? "text-danger" : "text-foreground",
          ].join(" ")}
        >
          {displayLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
