import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, XStack, YStack } from "tamagui";

type StatChipProps = {
  label: string;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor?: React.ComponentProps<typeof YStack>["bg"];
};

export function BentoStatChip({ label, icon, accentColor }: StatChipProps) {
  return (
    <XStack items="center" gap="$2">
      {icon ? (
        <YStack
          width={40}
          height={40}
          rounded={12}
          bg={accentColor ?? "$accent1"}
          items="center"
          justify="center"
        >
          <FontAwesome name={icon} size={18} color="#ffffff" />
        </YStack>
      ) : null}
      <Text fontSize="$2" color="$color10" fontWeight="500" flex={1}>
        {label}
      </Text>
    </XStack>
  );
}
