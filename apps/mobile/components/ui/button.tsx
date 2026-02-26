import React from "react";
import { Button as TButton, Text } from "tamagui";

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
  ...props
}: ButtonProps) {
  const heights: Record<ButtonSize, number> = {
    small: 32,
    default: 44,
    large: 48,
  };
  const radii: Record<ButtonSize, number> = {
    small: 9,
    default: 11,
    large: 12,
  };
  const variantStyles: Record<
    ButtonVariant,
    React.ComponentProps<typeof TButton>
  > = {
    primary: {
      bg: "$accent1",
      pressStyle: { opacity: 0.85, scale: 0.985 },
    },
    secondary: {
      bg: "$backgroundHover",
      borderColor: "$borderColor",
      borderWidth: 1,
      pressStyle: { opacity: 0.85, scale: 0.985 },
    },
    danger: {
      bg: "$red3",
      pressStyle: { opacity: 0.85, scale: 0.985 },
    },
    ghost: {
      bg: "transparent",
      pressStyle: { opacity: 0.65 },
    },
  };

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text color={variant === "primary" ? "$white" : "$color"}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <TButton
      height={heights[size]}
      rounded={radii[size]}
      borderWidth={0}
      disabledStyle={{ opacity: 0.4 }}
      {...variantStyles[variant]}
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

