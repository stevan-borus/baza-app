import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { useThemeTokens } from "./tokens";

export type SelectOption<V extends string> = {
  value: V;
  label: string;
  hint?: string;
};

type SelectProps<V extends string> = {
  placeholder: string;
  value: V | "";
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  leftIcon?: IconName;
  emptyText?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
  optionTestIDPrefix?: string;
};

const FIELD_HEIGHT = 48;
const SIDE_PADDING = 14;
const ADORNMENT_WIDTH = 32;

export function Select<V extends string>({
  placeholder,
  value,
  options,
  onChange,
  leftIcon,
  emptyText,
  error,
  disabled,
  testID,
  optionTestIDPrefix,
}: SelectProps<V>) {
  const tokens = useThemeTokens();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const hasValue = !!selected;

  return (
    <View className="gap-1.5">
      <Pressable
        testID={testID}
        onPress={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <View
          style={{
            height: FIELD_HEIGHT,
            paddingLeft: SIDE_PADDING,
            paddingRight: SIDE_PADDING,
          }}
          className={`border rounded-lg flex-row items-center bg-glass ${
            error ? "border-danger" : "border-glass-border"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {leftIcon ? (
            <View
              style={{ width: ADORNMENT_WIDTH }}
              className="items-start justify-center"
            >
              <Icon name={leftIcon} size={16} color={tokens.muted} />
            </View>
          ) : null}

          <View className="flex-1 justify-center">
            <Text
              className={`text-sm ${
                hasValue ? "text-foreground" : "text-muted"
              }`}
              numberOfLines={1}
            >
              {hasValue ? selected!.label : placeholder}
            </Text>
          </View>

          <View
            style={{ width: ADORNMENT_WIDTH }}
            className="items-end justify-center"
          >
            <MotiView
              animate={{ rotate: open ? "180deg" : "0deg" }}
              transition={{ type: "timing", duration: 150 }}
            >
              <Icon name="chevron-down" size={12} color={tokens.muted} />
            </MotiView>
          </View>
        </View>
      </Pressable>

      {open ? (
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 150 }}
          className="border border-glass-border rounded-lg bg-glass overflow-hidden"
        >
          {options.length === 0 ? (
            <View className="px-4 py-3 items-center">
              <Text className="text-sm text-muted text-center">
                {emptyText ?? "No options available"}
              </Text>
            </View>
          ) : (
            options.map((opt, idx) => {
              const isSelected = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  testID={
                    optionTestIDPrefix
                      ? `${optionTestIDPrefix}-${opt.value}`
                      : undefined
                  }
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <View
                    className={`flex-row items-center px-3.5 py-2.5 ${
                      idx > 0 ? "border-t border-glass-border" : ""
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-sm ${
                          isSelected
                            ? "text-foreground font-body-semibold"
                            : "text-foreground"
                        }`}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                      {opt.hint ? (
                        <Text className="text-xs text-muted mt-0.5">
                          {opt.hint}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Icon name="check" size={13} color={tokens.accent} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </MotiView>
      ) : null}

      {error ? (
        <Text className="text-xs font-body-medium pl-1 text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
