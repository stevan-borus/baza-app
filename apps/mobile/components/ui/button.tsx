import React from "react";
import { Pressable, Text, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";
import { WHATSAPP_GREEN } from "./whatsapp-icon";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "whatsapp";
type Size = "small" | "default" | "large";

type ButtonProps = Omit<PressableProps, "children"> & {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  children?: React.ReactNode;
};

const sizeCls: Record<Size, string> = {
  small: "h-9 rounded-xl px-3",
  default: "h-12 rounded-2xl px-4",
  large: "h-14 rounded-[18px] px-5",
};

const variantCls: Record<Variant, string> = {
  primary: "bg-accent active:opacity-90",
  secondary: "bg-glass border border-glass-border active:opacity-90",
  danger: "bg-danger-soft active:opacity-90",
  ghost: "bg-transparent active:opacity-65",
  // WhatsApp's official brand green (#25D366) as the button fill.
  whatsapp: "active:opacity-90",
};

const variantTextCls: Record<Variant, string> = {
  primary: "text-white font-body-semibold text-sm",
  secondary: "text-foreground font-body-semibold text-sm",
  danger: "text-danger font-body-semibold text-sm",
  ghost: "text-foreground font-body-semibold text-sm",
  whatsapp: "text-white font-body-semibold text-sm",
};

export function Button({
  variant = "primary",
  size = "default",
  disabled,
  children,
  onPress,
  className,
  style,
  ...props
}: ButtonProps) {
  function handlePress(e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      className={[
        "items-center justify-center flex-row gap-2",
        sizeCls[size],
        variantCls[variant],
        disabled ? "opacity-40" : "",
        className ?? "",
      ].join(" ")}
      style={[
        variant === "whatsapp" ? { backgroundColor: WHATSAPP_GREEN } : null,
        style as object,
      ]}
      {...props}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text className={variantTextCls[variant]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}

export function DangerButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="danger" {...props} />;
}
