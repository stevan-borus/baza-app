import React, { useState } from "react";
import { Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Input as TInput, Text, XStack, YStack, useTheme } from "tamagui";
import { useColorScheme } from "@/components/useColorScheme";
import { GLASS_BG, GLASS_BORDER } from "./tokens";

type InputProps = React.ComponentProps<typeof TInput> & {
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  label?: string;
  error?: string;
};

export function Input({ icon, label, error, ...props }: InputProps) {
  const isDark = useColorScheme() === "dark";
  const theme = useTheme();

  const inputElement = (
    <TInput
      bg={isDark ? GLASS_BG : "$color2"}
      borderColor={error ? "$red10" : isDark ? GLASS_BORDER : "$color2"}
      borderWidth={2}
      rounded={16}
      height={52}
      paddingHorizontal="$4"
      fontSize="$3"
      color={isDark ? "#ffffff" : "$color"}
      placeholderTextColor={isDark ? "rgba(255,255,255,0.4)" as any : "$color9"}
      focusStyle={{
        borderColor: error ? "$red10" : "$accent1",
        borderWidth: 2,
      }}
      {...(icon ? { pl: "$10" } : {})}
      {...props}
    />
  );

  return (
    <YStack gap="$1.5">
      {label ? (
        <Text
          fontSize="$2"
          fontWeight="500"
          color="$color10"
        >
          {label}
        </Text>
      ) : null}
      {icon ? (
        <XStack position="relative">
          <YStack
            position="absolute"
            left={0}
            top={0}
            bottom={0}
            width={48}
            items="center"
            justify="center"
            zIndex={1}
          >
            <FontAwesome
              name={icon}
              size={16}
              color={theme.color9?.val ?? "#737373"}
            />
          </YStack>
          {inputElement}
        </XStack>
      ) : (
        inputElement
      )}
      {error ? (
        <Text fontSize="$1" color="$red10" fontWeight="500" pl="$1">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}

export function PasswordInput(
  props: Omit<React.ComponentProps<typeof TInput>, "secureTextEntry"> & {
    iconColor?: string;
    label?: string;
    error?: string;
  },
) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const { iconColor, label, error, ...inputProps } = props;

  return (
    <YStack gap="$1.5">
      {label ? (
        <Text
          fontSize="$2"
          fontWeight="500"
          color="$color10"
        >
          {label}
        </Text>
      ) : null}
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
      {error ? (
        <Text fontSize="$1" color="$red10" fontWeight="500" pl="$1">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
