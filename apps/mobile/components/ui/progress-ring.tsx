import React from "react";
import { Text, YStack } from "tamagui";
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
    <YStack
      items="center"
      justify="center"
      width={size}
      height={size}
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
      <YStack position="absolute" items="center" gap="$0.5">
        <Text fontSize="$5" fontWeight="700" color="$color">
          {label ?? `${percentage}%`}
        </Text>
        {sublabel ? (
          <Text fontSize="$1" color="$color9">
            {sublabel}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
