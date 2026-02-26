import React, { PropsWithChildren } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Card as TCard, Text, XStack, YStack } from "tamagui";
import { BentoStatChip } from "./bento/stat-chip";

export function Card({
  children,
  ...rest
}: PropsWithChildren<React.ComponentProps<typeof TCard>>) {
  return (
    <TCard
      bg="$background"
      rounded={16}
      p="$4"
      borderWidth={1}
      borderColor="$borderColor"
      shadowColor="rgba(0,0,0,0.12)"
      shadowOffset={{ width: 0, height: 6 }}
      shadowOpacity={1}
      shadowRadius={12}
      elevation={2}
      {...rest}
    >
      {children}
    </TCard>
  );
}

export function Badge({
  children,
  color,
  variant = "filled",
}: PropsWithChildren<{
  color?: React.ComponentProps<typeof XStack>["bg"];
  variant?: "filled" | "soft";
}>) {
  if (variant === "soft") {
    return (
      <XStack
        bg={color ?? "$accent3"}
        px="$2.5"
        py="$1"
        rounded={999}
        alignSelf="flex-start"
      >
        <Text
          color={color ? "$color" : "$accent1"}
          fontSize="$1"
          fontWeight="600"
        >
          {children}
        </Text>
      </XStack>
    );
  }

  return (
    <XStack
      bg={color ?? "$accent1"}
      px="$2.5"
      py="$1"
      rounded={999}
      alignSelf="flex-start"
    >
      <Text color="$white" fontSize="$1" fontWeight="600">
        {children}
      </Text>
    </XStack>
  );
}

export function StatCard({
  label,
  value,
  icon,
  accentColor,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor?: React.ComponentProps<typeof YStack>["bg"];
}) {
  return (
    <YStack
      bg="$background"
      rounded={16}
      p="$4"
      gap="$2"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <BentoStatChip label={label} icon={icon} accentColor={accentColor} />
      <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
        {String(value)}
      </Text>
    </YStack>
  );
}

export function CalendarPrimitive({ month }: { month: string }) {
  return (
    <YStack
      bg="$background"
      rounded={16}
      p="$4"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <Text fontWeight="700" fontSize="$4" color="$color">
        {month}
      </Text>
    </YStack>
  );
}

