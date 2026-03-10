import React from "react";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";
import { styled, YStack, type YStackProps } from "tamagui";
import { GLASS_BG, GLASS_BORDER, GLASS_BG_ANDROID } from "./tokens";

const GlassCardFrame = styled(YStack, {
  borderRadius: 22,
  borderWidth: 1,
  borderColor: GLASS_BORDER,
  overflow: "hidden",
  padding: "$4",
  position: "relative",

  variants: {
    accentBorder: {
      left: {
        borderLeftWidth: 3,
        borderLeftColor: "$accent1",
      },
      top: {
        borderTopWidth: 3,
        borderTopColor: "$accent1",
      },
    },
    interactive: {
      true: {
        pressStyle: { opacity: 0.8 },
        hoverStyle: { opacity: 0.9 },
        cursor: "pointer",
      },
    },
    size: {
      sm: {
        padding: "$3",
        borderRadius: 16,
      },
      md: {
        padding: "$4",
        borderRadius: 20,
      },
      lg: {
        padding: "$5",
        borderRadius: 22,
      },
    },
  } as const,
});

type GlassCardProps = React.ComponentProps<typeof GlassCardFrame>;

export function GlassCard({ children, style, ...props }: GlassCardProps) {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";

  const webGlassStyle = isWeb
    ? { backdropFilter: "blur(12px)", backgroundColor: GLASS_BG }
    : undefined;

  const androidStyle = isAndroid
    ? { backgroundColor: GLASS_BG_ANDROID }
    : undefined;

  const iosStyle = isIOS
    ? { backgroundColor: "transparent" }
    : undefined;

  return (
    <GlassCardFrame
      style={[androidStyle ?? webGlassStyle ?? iosStyle, style] as YStackProps["style"]}
      {...props}
    >
      {isIOS && (
        <BlurView
          intensity={40}
          tint="dark"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
      {children}
    </GlassCardFrame>
  );
}

export type { GlassCardProps };
