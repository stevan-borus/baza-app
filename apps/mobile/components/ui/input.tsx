import React, { useState } from "react";
import {
  TextInput,
  View,
  Text,
  type TextInputProps,
  Pressable,
} from "react-native";
import { MotiView } from "@/components/ui/styled";
import FontAwesome from "@expo/vector-icons/FontAwesome";

type IconName = React.ComponentProps<typeof FontAwesome>["name"];

type InputProps = TextInputProps & {
  label?: string;
  /** New name. Also accepts `icon` for compatibility with existing callers. */
  leftIcon?: IconName;
  /** Legacy alias for `leftIcon`. Prefer `leftIcon` in new code. */
  icon?: IconName;
  iconColor?: string;
  error?: string;
  /** Extra slot rendered at the right edge (e.g. password eye toggle). */
  rightSlot?: React.ReactNode;
};

// Horizontal paddings (shadcn input-group style).
// The field is a row: [left adornment?] [content] [right adornment?].
const ADORNMENT_WIDTH = 40; // 16px icon + padding
const CONTENT_LEFT_NO_ICON = 16;
const CONTENT_LEFT_WITH_ICON = ADORNMENT_WIDTH;

export function Input({
  label,
  leftIcon,
  icon,
  iconColor = "rgba(255,255,255,0.5)",
  error,
  rightSlot,
  value,
  onFocus,
  onBlur,
  className,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || (typeof value === "string" && value.length > 0);
  const iconName = leftIcon ?? icon;
  const hasLabel = !!label;
  const contentLeft = iconName ? CONTENT_LEFT_WITH_ICON : CONTENT_LEFT_NO_ICON;

  return (
    <View className="gap-1.5">
      <View
        className={`bg-glass border rounded-2xl h-14 flex-row items-center ${
          error ? "border-danger" : "border-glass-border"
        }`}
      >
        {iconName ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-center justify-center"
          >
            <FontAwesome name={iconName} size={16} color={iconColor} />
          </View>
        ) : null}

        <View className="flex-1 h-full justify-center relative">
          {hasLabel ? (
            <MotiView
              className="absolute"
              style={{ left: 0 }}
              animate={{
                translateY: active ? -11 : 0,
                scale: active ? 0.78 : 1,
              }}
              transition={{ type: "timing", duration: 150 }}
              pointerEvents="none"
            >
              <Text className="text-muted text-base">{label}</Text>
            </MotiView>
          ) : null}

          <TextInput
            value={value}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            placeholderTextColor="rgba(255,255,255,0.35)"
            className={`text-foreground text-base ${className ?? ""}`}
            style={{
              paddingTop: hasLabel ? 10 : 0,
              paddingBottom: hasLabel ? 0 : 0,
            }}
            {...rest}
          />
        </View>

        {rightSlot ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-center justify-center"
          >
            {rightSlot}
          </View>
        ) : (
          <View style={{ width: iconName ? 8 : 16 }} />
        )}
      </View>
      {error ? (
        <Text className="text-danger text-xs font-medium pl-1">{error}</Text>
      ) : null}
    </View>
  );
}

type PasswordInputProps = Omit<InputProps, "secureTextEntry">;

export function PasswordInput(props: PasswordInputProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <Input
      {...props}
      secureTextEntry={hidden}
      leftIcon={props.leftIcon ?? props.icon ?? "lock"}
      rightSlot={
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12}>
          <FontAwesome
            name={hidden ? "eye" : "eye-slash"}
            size={16}
            color="rgba(255,255,255,0.5)"
          />
        </Pressable>
      }
    />
  );
}
