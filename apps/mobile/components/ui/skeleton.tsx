import React, { useEffect } from "react";
import { YStack, XStack } from "tamagui";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const AnimatedYStack = Animated.createAnimatedComponent(YStack);

function usePulse() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}

export function Skeleton({
  width,
  height = 16,
  rounded = 8,
}: {
  width?: number | string;
  height?: number;
  rounded?: number;
}) {
  const pulseStyle = usePulse();

  return (
    <AnimatedYStack
      bg="rgba(255,255,255,0.06)"
      width={width as any}
      height={height}
      rounded={rounded}
      style={pulseStyle}
    />
  );
}

export function SkeletonText({
  width = "80%",
  lines = 1,
}: {
  width?: number | string;
  lines?: number;
}) {
  return (
    <YStack gap="$2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? "60%" : width}
          height={14}
          rounded={7}
        />
      ))}
    </YStack>
  );
}

export function SkeletonCard() {
  const pulseStyle = usePulse();

  return (
    <AnimatedYStack
      bg="rgba(255,255,255,0.03)"
      rounded={22}
      p="$4"
      gap="$3"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.05)"
      style={pulseStyle}
    >
      <XStack items="center" gap="$3">
        <Skeleton width={40} height={40} rounded={12} />
        <YStack flex={1} gap="$2">
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
        </YStack>
      </XStack>
    </AnimatedYStack>
  );
}

export function SkeletonStatCard() {
  const pulseStyle = usePulse();

  return (
    <AnimatedYStack
      bg="rgba(255,255,255,0.03)"
      rounded={22}
      p="$5"
      gap="$2"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.05)"
      style={pulseStyle}
    >
      <Skeleton width={40} height={40} rounded={12} />
      <Skeleton width="50%" height={14} />
      <Skeleton width={80} height={32} rounded={8} />
    </AnimatedYStack>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <YStack gap="$3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </YStack>
  );
}
