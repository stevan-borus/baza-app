import React from "react";
import { TouchableOpacity } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, XStack } from "tamagui";

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
      <XStack
        bg={variant === "danger" ? "$red3" : "$backgroundHover"}
        rounded={10}
        px="$3"
        py="$2.5"
        items="center"
        gap="$2"
      >
        {showIcon ? (
          <FontAwesome
            name={icon}
            size={14}
            color={variant === "danger" ? "#ef4444" : undefined}
          />
        ) : null}
        <Text
          fontSize="$2"
          fontWeight="500"
          color={variant === "danger" ? "$red10" : "$color"}
        >
          {displayLabel}
        </Text>
      </XStack>
    </TouchableOpacity>
  );
}

