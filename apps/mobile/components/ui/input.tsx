import React, { useContext, useRef, useState } from "react";
import {
  Platform,
  TextInput,
  View,
  Text,
  type TextInputProps,
  Pressable,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { MotiView } from "@/components/ui/styled";
import { Icon, type IconName } from "@/components/ui/icon";
import { useThemeTokens } from "./tokens";
import { InsideBottomSheetContext } from "./sheet";

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
  testID,
  ...rest
}: InputProps) {
  const tokens = useThemeTokens();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const active = focused || (typeof value === "string" && value.length > 0);
  const iconName = leftIcon ?? icon;
  const hasLabel = !!label;
  // Theme-driven so the icon stays visible in both light (ink on bone)
  // and dark (cream on warm dark) variants.
  const resolvedIconColor = iconColor ?? tokens.muted;
  // Use BottomSheetTextInput when inside a sheet (so the keyboard pushes
  // the sheet up); plain TextInput everywhere else.
  //
  // On web, gorhom's BottomSheetTextInput crashes with
  // `RNTextInput.default.State.currentlyFocusedInput is not a function` —
  // react-native-web doesn't expose the same TextInputState shape that
  // gorhom expects. There is no soft keyboard on web anyway, so falling
  // back to plain TextInput on web is both safe and correct.
  const insideSheet = useContext(InsideBottomSheetContext);
  const useBottomSheetTextInput = insideSheet && Platform.OS !== "web";
  const TextInputComponent = (useBottomSheetTextInput
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
        className={`border rounded-lg bg-glass ${
          isMultiline ? "flex-row items-start" : "flex-row items-center"
        } ${error ? "border-danger" : "border-glass-border"}`}
      >
        {iconName ? (
          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-start justify-center"
          >
            <Icon
              name={iconName}
              size={16}
              color={resolvedIconColor}
            />
          </View>
        ) : null}

        <Pressable
          // On iOS + the RN new architecture a TextInput's `testID` doesn't
          // reliably surface as an accessibilityIdentifier in the view tree
          // XCUITest/Maestro read, but a Pressable's does. Mirror the field's
          // testID onto this wrapper for native only (tapping it focuses the
          // input, so Maestro `tapOn id` + `inputText` work). Native-only so the
          // web DOM doesn't end up with two elements sharing one data-testid.
          testID={Platform.OS === "web" ? undefined : testID}
          onPress={() => inputRef.current?.focus()}
          className={`flex-1 relative ${isMultiline ? "self-stretch" : "h-full justify-center"}`}
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
              // Keep the decorative floating label out of the accessibility
              // tree so screen readers (and e2e tools) read the field via its
              // own accessibilityLabel below, not this overlapping View.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text className="font-sans text-sm text-muted">{label}</Text>
            </MotiView>
          ) : null}

          <TextInputComponent
            ref={inputRef}
            value={value}
            // Keep testID on the input itself for web (react-native-web emits a
            // `data-testid` that Playwright targets). Native/Maestro matches the
            // Pressable wrapper above, since a TextInput's testID doesn't
            // reliably surface in the iOS accessibility tree.
            testID={testID}
            // Give the input its own a11y label so iOS keeps it as a distinct
            // accessible element.
            accessibilityLabel={label}
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
        </Pressable>

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
          <Icon
            name={hidden ? "eye" : "eye-off"}
            size={18}
            color={tokens.muted}
          />
        </Pressable>
      }
    />
  );
}
