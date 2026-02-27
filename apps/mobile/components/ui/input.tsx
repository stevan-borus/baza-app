import React, { useState } from "react";
import { Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Input as TInput, XStack, useTheme } from "tamagui";
import { useColorScheme } from "@/components/useColorScheme";

export function Input(props: React.ComponentProps<typeof TInput>) {
  const isDark = useColorScheme() === "dark";
  return (
    <TInput
      bg={isDark ? "rgba(255,255,255,0.08)" : "$color2"}
      borderColor={isDark ? "rgba(255,255,255,0.08)" : "$color2"}
      borderWidth={2}
      rounded={16}
      height={52}
      paddingHorizontal="$4"
      fontSize="$3"
      color={isDark ? "#ffffff" : "$color"}
      placeholderTextColor={isDark ? "rgba(255,255,255,0.4)" : "$color9"}
      focusStyle={{
        borderColor: "$accent1",
        borderWidth: 2,
      }}
      {...props}
    />
  );
}

export function PasswordInput(
  props: Omit<React.ComponentProps<typeof TInput>, "secureTextEntry"> & {
    iconColor?: string;
  },
) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const { iconColor, ...inputProps } = props;

  return (
    <XStack position="relative">
      <Input
        secureTextEntry={!visible}
        textContentType="password"
        autoComplete="password"
        flex={1}
        pr="$10"
        {...inputProps}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 52,
          alignItems: "center",
          justifyContent: "center",
        }}
        hitSlop={8}
      >
        <FontAwesome
          name={visible ? "eye" : "eye-slash"}
          size={18}
          color={iconColor ?? theme.color9?.val ?? "#737373"}
        />
      </Pressable>
    </XStack>
  );
}
