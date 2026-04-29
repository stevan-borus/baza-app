import React, { useContext, useState } from "react";
import {
  TextInput,
  View,
  Text,
  type TextInputProps,
  Pressable,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { MotiView } from "@/components/ui/styled";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useThemeTokens } from "./tokens";
import { InsideBottomSheetContext } from "./sheet";

type IconName = React.ComponentProps<typeof FontAwesome>["name"];

type InputProps = TextInputProps & {
  label?: string;
  leftIcon?: IconName;
  /** Legacy alias for `leftIcon`. */
  icon?: IconName;
  iconColor?: string;
  error?: string;
  /** Extra slot rendered at the right edge (e.g. password eye toggle). */
  rightSlot?: React.ReactNode;
};

const FIELD_HEIGHT = 56;
const SIDE_PADDING = 16;
const ADORNMENT_WIDTH = 36;

export function Input({
  label,
  leftIcon,
  icon,
  iconColor,
  error,
  rightSlot,
  value,
  onFocus,
  onBlur,
  className,
  ...rest
}: InputProps) {
  const tokens = useThemeTokens();
  const [focused, setFocused] = useState(false);
  const active = focused || (typeof value === "string" && value.length > 0);
  const iconName = leftIcon ?? icon;
  const hasLabel = !!label;
  const resolvedIconColor = iconColor ?? tokens.muted;
  // Use BottomSheetTextInput when inside a sheet (so the keyboard pushes
  // the sheet up); plain TextInput everywhere else.
  const insideSheet = useContext(InsideBottomSheetContext);
  const TextInputComponent = (insideSheet
    ? BottomSheetTextInput
    : TextInput) as unknown as typeof TextInput;

  return (
    <View className="gap-1.5">
      <View
        style={{
          height: FIELD_HEIGHT,
          paddingLeft: SIDE_PADDING,
          paddingRight: SIDE_PADDING,
        }}
        className={`border rounded-2xl flex-row items-center bg-glass ${error ? "border-danger" : "border-glass-border"}`}
      >
        {iconName ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-start justify-center"
          >
            <FontAwesome name={iconName} size={16} color={resolvedIconColor} />
          </View>
        ) : null}

        <View className="flex-1 h-full justify-center relative">
          {hasLabel ? (
            <MotiView
              className="absolute left-0"
              animate={{
                translateY: active ? -10 : 0,
                scale: active ? 0.78 : 1,
              }}
              transition={{ type: "timing", duration: 150 }}
              style={{ transformOrigin: "left center" }}
              pointerEvents="none"
            >
              <Text className="text-base text-muted">{label}</Text>
            </MotiView>
          ) : null}

          <TextInputComponent
            value={value}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            placeholderTextColor={tokens.faint}
            className={`text-base text-foreground ${className ?? ""}`}
            style={{
              paddingTop: hasLabel ? 14 : 0,
              paddingBottom: hasLabel ? 2 : 0,
              lineHeight: 20,
            }}
            {...rest}
          />
        </View>

        {rightSlot ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-end justify-center"
          >
            {rightSlot}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text className="text-xs font-body-medium pl-1 text-danger">{error}</Text>
      ) : null}
    </View>
  );
}

type PasswordInputProps = Omit<InputProps, "secureTextEntry">;

export function PasswordInput(props: PasswordInputProps) {
  const [hidden, setHidden] = useState(true);
  const tokens = useThemeTokens();
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
            color={tokens.muted}
          />
        </Pressable>
      }
    />
  );
}
