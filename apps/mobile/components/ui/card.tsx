import React, { PropsWithChildren } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Card as TCard, Text, XStack, YStack } from "tamagui";
import Animated, { FadeInDown } from "react-native-reanimated";
import { BentoStatChip } from "./bento/stat-chip";

const AnimatedTCard = Animated.createAnimatedComponent(TCard);

export function Card({
  children,
  ...rest
}: PropsWithChildren<React.ComponentProps<typeof TCard>>) {
  return (
    <AnimatedTCard
      entering={FadeInDown.duration(400).springify()}
      bg="$color2"
      rounded={22}
      p="$5"
      borderWidth={0}
      shadowColor="rgba(0,0,0,0.06)"
      shadowOffset={{ width: 0, height: 4 }}
      shadowOpacity={1}
      shadowRadius={16}
      elevation={2}
      {...rest}
    >
      {children}
    </AnimatedTCard>
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
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <YStack
        bg="$color2"
        rounded={22}
        p="$5"
        gap="$2"
        borderWidth={0}
      >
        <BentoStatChip label={label} icon={icon} accentColor={accentColor} />
        <Text fontSize="$8" fontWeight="800" color="$color" letterSpacing={-0.5}>
          {String(value)}
        </Text>
      </YStack>
    </Animated.View>
  );
}

export function CalendarPrimitive({ month }: { month: string }) {
  return (
    <YStack
      bg="$color2"
      rounded={20}
      p="$5"
      borderWidth={0}
    >
      <Text fontWeight="700" fontSize="$4" color="$color">
        {month}
      </Text>
    </YStack>
  );
}
