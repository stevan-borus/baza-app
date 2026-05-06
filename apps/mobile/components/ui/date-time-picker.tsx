import { useState } from "react";
import { Pressable, Platform, View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import { getDateLocale } from "@/lib/i18n";
import { useThemeTokens, ACCENT } from "./tokens";
import { WebDateTimeSheet } from "./date-time-picker-web";

const MUTED_COLOR = "#737373";

type DateTimePickerProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  testID?: string;
};

/**
 * Date / time / datetime picker.
 *
 * Native: uses react-native-modal-datetime-picker (the original behavior).
 * Web: opens an AppSheet containing react-day-picker styled to the Studio
 * look, plus an HTML <input type="time"> for the time-of-day. Both share
 * the same trigger Pressable.
 */
export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  placeholder,
  minimumDate,
  maximumDate,
  disabled = false,
  testID,
}: DateTimePickerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const tokens = useThemeTokens();

  const locale = i18n.language === "en" ? "en" : "sr-Latn";
  const dateLocale = getDateLocale();
  const isWeb = Platform.OS === "web";

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
        testID={testID}
        accessibilityRole="button"
        onPress={() => !disabled && setIsVisible(true)}
        disabled={disabled}
      >
        <View
          style={{
            height: 48,
            paddingHorizontal: 14,
            opacity: disabled ? 0.5 : 1,
          }}
          className="border rounded-2xl flex-row items-center justify-between bg-glass border-glass-border"
        >
          <Text
            className={`text-sm flex-1 ${displayValue ? "text-foreground" : "text-muted"}`}
          >
            {displayValue || placeholder}
          </Text>
          <FontAwesome
            name={mode === "time" ? "clock-o" : "calendar"}
            size={15}
            color={MUTED_COLOR}
          />
        </View>
      </Pressable>

      {isWeb ? (
        <WebDateTimeSheet
          open={isVisible}
          onOpenChange={(o) => !o && setIsVisible(false)}
          value={value}
          mode={mode}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onConfirm={handleConfirm}
          locale={locale}
          accent={tokens.accent}
        />
      ) : (
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
      )}
    </>
  );
}

