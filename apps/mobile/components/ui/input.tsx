import React, { useState } from "react";
import { Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Input as TInput, XStack, useTheme } from "tamagui";
import { useThemeName } from "@tamagui/core";

export function Input(props: React.ComponentProps<typeof TInput>) {
  const themeName = useThemeName();
  const isDark = String(themeName).includes("dark");

  return (
    <TInput
      backgroundColor={isDark ? "$colorTransparent" : "$background"}
      borderColor={isDark ? "$accent9" : "$borderColor"}
      borderWidth={1}
      rounded={11}
      height={44}
      paddingHorizontal="$4"
      fontSize="$3"
      color={isDark ? "$white" : "$color"}
      placeholderTextColor={isDark ? "$white" : "$color10"}
      focusStyle={{
        borderColor: isDark ? "$accent1" : "$accent8",
        borderWidth: 2,
      }}
      {...props}
    />
  );
}

export function PasswordInput(
  props: Omit<React.ComponentProps<typeof TInput>, "secureTextEntry">,
) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  return (
    <XStack position="relative">
      <Input
        secureTextEntry={!visible}
        textContentType="password"
        autoComplete="password"
        flex={1}
        pr="$10"
        {...props}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
        hitSlop={8}
      >
        <FontAwesome
          name={visible ? "eye" : "eye-slash"}
          size={18}
          color={theme.colorSubtle?.val ?? "#737373"}
        />
      </Pressable>
    </XStack>
  );
}

