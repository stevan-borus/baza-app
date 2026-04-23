import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ACCENT } from "./tokens";

type ProgressRingProps = {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
};

export function ProgressRing({
  progress,
  size = 100,
  strokeWidth = 8,
  color = ACCENT,
  trackColor = "rgba(255,255,255,0.08)",
  label,
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const strokeDashoffset = circumference * (1 - clampedProgress);
  const percentage = Math.round(clampedProgress * 100);

  return (
    <View
      className="flex-col items-center justify-center"
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      accessibilityLabel={`${percentage}% complete`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View className="absolute flex-col items-center" style={{ gap: 4 }}>
        <Text className="text-lg font-bold text-white" numberOfLines={1}>
          {label ?? `${percentage}%`}
        </Text>
        {sublabel ? (
          <Text className="text-xs text-white" style={{ opacity: 0.5 }} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
