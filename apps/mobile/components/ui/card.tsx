import React, { PropsWithChildren } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, YStack } from "tamagui";
import Animated, { FadeInDown } from "react-native-reanimated";
import { GlassCard, type GlassCardProps } from "./glass-card";
import { BentoStatChip } from "./bento/stat-chip";

// Re-export Badge from its new home for backward compatibility
export { Badge } from "./badge";

const AnimatedGlassCard = Animated.createAnimatedComponent(GlassCard);

export function Card({
  children,
  ...rest
}: PropsWithChildren<GlassCardProps>) {
  return (
    <AnimatedGlassCard
      entering={FadeInDown.duration(400).springify()}
      {...rest}
    >
      {children}
    </AnimatedGlassCard>
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
      <GlassCard>
        <YStack gap="$2">
          <BentoStatChip label={label} icon={icon} accentColor={accentColor} />
          <Text fontSize="$8" fontWeight="800" color="$color" letterSpacing={-0.5}>
            {String(value)}
          </Text>
        </YStack>
      </GlassCard>
    </Animated.View>
  );
}

export function CalendarPrimitive({ month }: { month: string }) {
  return (
    <GlassCard size="md">
      <Text fontWeight="700" fontSize="$4" color="$color">
        {month}
      </Text>
    </GlassCard>
  );
}
