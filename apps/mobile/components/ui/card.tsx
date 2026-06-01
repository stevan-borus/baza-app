import React, { PropsWithChildren } from "react";
import { View } from "react-native";
import { type IconName } from "@/components/ui/icon";
import { Text } from "react-native";
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
  icon?: IconName;
  accentColor?: string;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View className="flex-col gap-2">
          <BentoStatChip label={label} icon={icon} accentColor={accentColor} />
          <Text className="text-4xl font-extrabold tracking-tight text-foreground">
            {String(value)}
          </Text>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

export function CalendarPrimitive({ month }: { month: string }) {
  return (
    <GlassCard size="md">
      <Text className="font-body-bold text-base text-foreground">
        {month}
      </Text>
    </GlassCard>
  );
}
