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

// Mirrors the report bar chart (e.g. PRIHOD KROZ VREME): a row of bars at
// varied heights resting on a baseline, with a few axis-label blocks below.
// Heights are a fixed, deterministic pattern (no Math.random — banned in the
// test stack and pointless for a placeholder).
const CHART_BAR_RATIOS = [0.4, 0.7, 0.55, 0.9, 0.5, 0.75, 0.45, 0.85, 0.6, 0.35];

export function SkeletonChart({
  height = 120,
  bars = CHART_BAR_RATIOS.length,
}: {
  height?: number;
  bars?: number;
}) {
  const ratios = Array.from(
    { length: bars },
    (_, i) => CHART_BAR_RATIOS[i % CHART_BAR_RATIOS.length],
  );
  return (
    <View style={{ paddingTop: 16, gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          height,
          gap: 6,
        }}
      >
        {ratios.map((r, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Skeleton width="100%" height={Math.max(8, r * height)} rounded={4} />
          </View>
        ))}
      </View>
      <View className="flex-row justify-between">
        <Skeleton width={28} height={10} rounded={5} />
        <Skeleton width={28} height={10} rounded={5} />
        <Skeleton width={28} height={10} rounded={5} />
      </View>
    </View>
  );
}

// Mirrors a heatmap grid (e.g. iskoriščenost weekday × time-bucket): a leading
// row-label column plus `cols` cells per `rows` rows. Cells share the pulse.
export function SkeletonGrid({
  rows = 5,
  cols = 6,
  cell = 22,
}: {
  rows?: number;
  cols?: number;
  cell?: number;
}) {
  return (
    <View style={{ paddingTop: 14, gap: 4 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} className="flex-row items-center" style={{ gap: 4 }}>
          <Skeleton width={28} height={10} rounded={5} />
          {Array.from({ length: cols }).map((__, c) => (
            <View key={c} style={{ flex: 1 }}>
              <Skeleton width="100%" height={cell} rounded={6} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// Mirrors a report breakdown list (PO PAKETU / PO NAČINU PLAĆANJA): per row a
// label + amount on one line, a thin progress bar, then a small caption.
// Matches the real row's gap:4 internal / gap:10 between rows. No outer
// padding — callers render it inside the section's existing padded View, the
// same slot the real rows occupy.
export function SkeletonBreakdownRows({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ gap: 4 }}>
          <View className="flex-row justify-between items-baseline">
            <Skeleton width="45%" height={14} rounded={7} />
            <Skeleton width={64} height={14} rounded={7} />
          </View>
          <Skeleton width="100%" height={4} rounded={2} />
          <Skeleton width="30%" height={11} rounded={6} />
        </View>
      ))}
    </View>
  );
}
