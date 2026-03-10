import React, { PropsWithChildren } from "react";
import { Text, XStack } from "tamagui";
import { ACCENT_LIGHT, DANGER, WARNING } from "./tokens";

type BadgeStatus = "success" | "warning" | "danger" | "info" | "neutral";

type BadgeProps = PropsWithChildren<{
  color?: React.ComponentProps<typeof XStack>["bg"];
  variant?: "filled" | "soft";
  status?: BadgeStatus;
}>;

const statusColors = {
  success: { bg: "rgba(46,91,66,0.25)" as const, text: ACCENT_LIGHT },
  warning: { bg: "rgba(245,158,11,0.2)" as const, text: WARNING },
  danger: { bg: "rgba(239,68,68,0.2)" as const, text: DANGER },
  info: { bg: "rgba(59,130,246,0.2)" as const, text: "#3b82f6" as const },
  neutral: { bg: "rgba(255,255,255,0.08)" as const, text: "rgba(255,255,255,0.6)" as const },
} satisfies Record<BadgeStatus, { bg: string; text: string }>;

export function Badge({ children, color, variant = "filled", status }: BadgeProps) {
  if (status) {
    const sc = statusColors[status];
    return (
      <XStack
        bg={sc.bg as any}
        px="$2.5"
        py="$1"
        rounded={999}
        alignSelf="flex-start"
      >
        <Text color={sc.text as any} fontSize="$1" fontWeight="600">
          {children}
        </Text>
      </XStack>
    );
  }

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
