import { useState } from "react";
import { Pressable, Platform } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useTranslation } from "react-i18next";
import { XStack, Text, useTheme } from "tamagui";
import { useColorScheme } from "@/components/useColorScheme";
import { getDateLocale } from "@/lib/i18n";
import { ACCENT } from "./tokens";

type DateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
};

/**
 * A styled date/time picker that uses the native modal picker.
 * Displays the selected value in a pressable input-like container.
 */
export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  placeholder,
  minimumDate,
  maximumDate,
  disabled = false,
}: DateTimePickerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = useTheme();

  const locale = i18n.language === "en" ? "en" : "sr-Latn";
  const dateLocale = getDateLocale();

  function handleConfirm(date: Date) {
    setIsVisible(false);
    onChange(date);
  }

  function handleCancel() {
    setIsVisible(false);
  }

  function formatValue(date: Date | null): string {
    if (!date) return "";
    if (mode === "date") {
      return date.toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    if (mode === "time") {
      return date.toLocaleTimeString(dateLocale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    return `${date.toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })} ${date.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }

  const displayValue = formatValue(value);

  return (
    <>
      <Pressable
        onPress={() => !disabled && setIsVisible(true)}
        disabled={disabled}
      >
        <XStack
          bg={colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "$color2"}
          borderColor={colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "$color2"}
          borderWidth={2}
          borderRadius={16}
          height={52}
          paddingHorizontal="$4"
          alignItems="center"
          justifyContent="space-between"
          opacity={disabled ? 0.5 : 1}
        >
          <Text
            fontSize="$3"
            color={displayValue ? "$color" : "$color9"}
            opacity={displayValue ? 1 : 0.6}
          >
            {displayValue || placeholder}
          </Text>
          <FontAwesome
            name="calendar"
            size={16}
            color={theme.color9?.val ?? "#737373"}
          />
        </XStack>
      </Pressable>

      <DateTimePickerModal
        isVisible={isVisible}
        mode={mode}
        date={value ?? new Date()}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        isDarkModeEnabled={colorScheme === "dark"}
        themeVariant={colorScheme === "dark" ? "dark" : "light"}
        display={Platform.OS === "ios" ? "inline" : "default"}
        locale={locale}
        confirmTextIOS={i18n.language === "en" ? "Confirm" : "Potvrdi"}
        cancelTextIOS={i18n.language === "en" ? "Cancel" : "Otkaži"}
        accentColor={ACCENT}
        buttonTextColorIOS={ACCENT}
        pickerContainerStyleIOS={{ paddingHorizontal: 16 }}
      />
    </>
  );
}
