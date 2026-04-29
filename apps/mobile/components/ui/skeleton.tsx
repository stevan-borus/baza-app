import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useThemeTokens } from "./tokens";

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
  const tokens = useThemeTokens();

  return (
    <Animated.View
      style={[
        // eslint-disable-next-line react-native/no-inline-styles
        {
          backgroundColor: tokens.glassStrong,
          width: width as any,
          height,
          borderRadius: rounded,
        },
        pulseStyle,
      ]}
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
    <View className="flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? "60%" : width}
          height={14}
          rounded={7}
        />
      ))}
    </View>
  );
}

export function SkeletonCard() {
  const pulseStyle = usePulse();
  const tokens = useThemeTokens();

  return (
    <Animated.View
      style={[
        {
          backgroundColor: tokens.glass,
          borderRadius: 22,
          padding: 16,
          gap: 12,
          borderWidth: 1,
          borderColor: tokens.glassBorder,
        },
        pulseStyle,
      ]}
    >
      <View className="flex-row items-center gap-3">
        <Skeleton width={40} height={40} rounded={12} />
        <View className="flex-1 flex-col gap-2">
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    </Animated.View>
  );
}

export function SkeletonStatCard() {
  const pulseStyle = usePulse();
  const tokens = useThemeTokens();

  return (
    <Animated.View
      style={[
        {
          backgroundColor: tokens.glass,
          borderRadius: 22,
          padding: 20,
          gap: 8,
          borderWidth: 1,
          borderColor: tokens.glassBorder,
        },
        pulseStyle,
      ]}
    >
      <Skeleton width={40} height={40} rounded={12} />
      <Skeleton width="50%" height={14} />
      <Skeleton width={80} height={32} rounded={8} />
    </Animated.View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View className="flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
