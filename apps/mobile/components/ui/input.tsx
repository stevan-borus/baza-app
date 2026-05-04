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
import Feather from "@expo/vector-icons/Feather";
import { useThemeTokens } from "./tokens";
import { InsideBottomSheetContext } from "./sheet";

type IconName = React.ComponentProps<typeof FontAwesome>["name"];

// Map of common FontAwesome legacy names → Feather (thin, modern stroke
// matched to the rest of the Studio chrome). Falls back to FontAwesome
// for icons not in the map.
type FeatherName = React.ComponentProps<typeof Feather>["name"];
const FA_TO_FEATHER: Partial<Record<IconName, FeatherName>> = {
  envelope: "mail",
  lock: "lock",
  user: "user",
  search: "search",
  phone: "phone",
};

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

const FIELD_HEIGHT = 48;
const SIDE_PADDING = 14;
const ADORNMENT_WIDTH = 32;

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
  // Theme-driven so the icon stays visible in both light (ink on bone)
  // and dark (cream on warm dark) variants.
  const resolvedIconColor = iconColor ?? tokens.muted;
  // Use BottomSheetTextInput when inside a sheet (so the keyboard pushes
  // the sheet up); plain TextInput everywhere else.
  const insideSheet = useContext(InsideBottomSheetContext);
  const TextInputComponent = (insideSheet
    ? BottomSheetTextInput
    : TextInput) as unknown as typeof TextInput;

  // Multiline inputs grow with content; non-multiline keep the standard
  // 48px field height for layout consistency.
  const isMultiline = !!rest.multiline;

  return (
    <View className="gap-1.5">
      <View
        style={
          isMultiline
            ? {
                minHeight: FIELD_HEIGHT * 2.25,
                paddingLeft: SIDE_PADDING,
                paddingRight: SIDE_PADDING,
                paddingTop: 10,
                paddingBottom: 10,
              }
            : {
                height: FIELD_HEIGHT,
                paddingLeft: SIDE_PADDING,
                paddingRight: SIDE_PADDING,
              }
        }
        className={`border rounded-lg bg-surface ${
          isMultiline ? "flex-row items-start" : "flex-row items-center"
        } ${error ? "border-danger" : "border-glass-border"}`}
      >
        {iconName ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-start justify-center"
          >
            {FA_TO_FEATHER[iconName] ? (
              <Feather
                name={FA_TO_FEATHER[iconName]!}
                size={18}
                color={resolvedIconColor}
              />
            ) : (
              <FontAwesome
                name={iconName}
                size={16}
                color={resolvedIconColor}
              />
            )}
          </View>
        ) : null}

        <View
          className={`flex-1 relative ${isMultiline ? "" : "h-full justify-center"}`}
        >
          {hasLabel ? (
            <MotiView
              className="absolute left-0"
              animate={{
                translateY: active ? -9 : 0,
                scale: active ? 0.78 : 1,
              }}
              transition={{ type: "timing", duration: 150 }}
              style={{ transformOrigin: "left center" }}
              pointerEvents="none"
            >
              <Text className="font-sans text-sm text-muted">{label}</Text>
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
            className={`text-sm font-sans text-foreground ${className ?? ""}`}
            style={
              isMultiline
                ? { padding: 0, lineHeight: 20, textAlignVertical: "top" }
                : {
                    paddingTop: hasLabel ? 12 : 0,
                    paddingBottom: hasLabel ? 2 : 0,
                    lineHeight: 18,
                  }
            }
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
        <Text className="text-xs font-body-medium pl-1 text-danger">
          {error}
        </Text>
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
        <Pressable
          onPress={() => setHidden((h) => !h)}
          hitSlop={12}
          android_ripple={null}
          className="active:opacity-60"
        >
          <Feather
            name={hidden ? "eye" : "eye-off"}
            size={18}
            color={tokens.muted}
          />
        </Pressable>
      }
    />
  );
}
