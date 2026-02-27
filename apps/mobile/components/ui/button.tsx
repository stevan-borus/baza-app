import React from "react";
import * as Haptics from "expo-haptics";
import { Button as TButton, Text } from "tamagui";
import { useColorScheme } from "@/components/useColorScheme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "small" | "default" | "large";

type ButtonProps = Omit<
  React.ComponentProps<typeof TButton>,
  "size" | "variant"
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "default",
  children,
  onPress,
  ...props
}: ButtonProps) {
  const isDark = useColorScheme() === "dark";
  const heights: Record<ButtonSize, number> = {
    small: 36,
    default: 50,
    large: 56,
  };
  const radii: Record<ButtonSize, number> = {
    small: 12,
    default: 16,
    large: 18,
  };
  const variantStyles: Record<
    ButtonVariant,
    React.ComponentProps<typeof TButton>
  > = {
    primary: {
      bg: "$accent1",
      pressStyle: { opacity: 0.9, scale: 0.96 },
    },
    secondary: {
      bg: isDark ? "rgba(255,255,255,0.08)" : "$color2",
      pressStyle: { opacity: 0.9, scale: 0.96 },
    },
    danger: {
      bg: "$red3",
      pressStyle: { opacity: 0.9, scale: 0.96 },
    },
    ghost: {
      bg: "transparent",
      pressStyle: { opacity: 0.65 },
    },
  };

  const textColor =
    variant === "primary"
      ? "#ffffff"
      : isDark
        ? "#ffffff"
        : "$color";

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text color={textColor}>
        {children}
      </Text>
    ) : (
      children
    );

  function handlePress(e: any) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  }

  return (
    <TButton
      height={heights[size]}
      rounded={radii[size]}
      borderWidth={0}
      disabledStyle={{ opacity: 0.4 }}
      {...variantStyles[variant]}
      onPress={handlePress}
      {...props}
    >
      {content}
    </TButton>
  );
}

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}

export function DangerButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="danger" {...props} />;
}
