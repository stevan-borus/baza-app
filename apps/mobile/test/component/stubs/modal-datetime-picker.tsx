/**
 * Component-test stub for `react-native-modal-datetime-picker` — a native
 * modal. Renders a marker with confirm/cancel hooks so tests can drive a
 * date selection without the native picker UI.
 */
import React from "react";
import { Pressable, View } from "react-native";

type Props = {
  isVisible?: boolean;
  date?: Date;
  onConfirm?: (date: Date) => void;
  onCancel?: () => void;
};

export default function DateTimePickerModal({
  isVisible,
  date,
  onConfirm,
  onCancel,
}: Props) {
  if (!isVisible) return null;
  return (
    <View testID="stub-datetime-picker">
      <Pressable
        testID="stub-datetime-picker-confirm"
        onPress={() => onConfirm?.(date ?? new Date())}
      />
      <Pressable testID="stub-datetime-picker-cancel" onPress={() => onCancel?.()} />
    </View>
  );
}
