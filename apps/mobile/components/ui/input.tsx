import React, { useState } from "react";
import { TextInput, View, type TextInputProps, Pressable } from "react-native";
import { MotiText } from "moti";
import FontAwesome from "@expo/vector-icons/FontAwesome";

type InputProps = TextInputProps & {
  label?: string;
  leftIcon?: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor?: string;
};

export function Input({
  label,
  leftIcon,
  iconColor = "rgba(255,255,255,0.5)",
  value,
  onFocus,
  onBlur,
  className,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || (typeof value === "string" && value.length > 0);

  return (
    <View className="bg-glass border border-glass-border rounded-2xl px-4 h-14 justify-center">
      {label ? (
        <MotiText
          className="absolute left-4 text-muted"
          animate={{
            top: active ? 6 : 18,
            fontSize: active ? 11 : 15,
          }}
          transition={{ type: "timing", duration: 150 }}
        >
          {label}
        </MotiText>
      ) : null}
      <View className="flex-row items-center gap-2 mt-3">
        {leftIcon ? (
          <FontAwesome name={leftIcon} size={16} color={iconColor} />
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
          className={`flex-1 text-foreground text-base ${className ?? ""}`}
          {...rest}
        />
      </View>
    </View>
  );
}

type PasswordInputProps = Omit<InputProps, "secureTextEntry">;

export function PasswordInput(props: PasswordInputProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <View className="relative">
      <Input {...props} secureTextEntry={hidden} leftIcon="lock" />
      <Pressable
        onPress={() => setHidden((h) => !h)}
        className="absolute right-4 top-0 bottom-0 justify-center"
        hitSlop={12}
      >
        <FontAwesome
          name={hidden ? "eye" : "eye-slash"}
          size={16}
          color="rgba(255,255,255,0.5)"
        />
      </Pressable>
    </View>
  );
}
