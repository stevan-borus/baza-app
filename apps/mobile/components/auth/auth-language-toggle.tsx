import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * sr ↔ en toggle for auth-screen legal strips. Pressing flips the i18n
 * language immediately. Once authenticated, the regular preferredLocale
 * persistence kicks in via ProfileSheet's LanguageSwitcher.
 */
export function AuthLanguageToggle() {
  const { i18n, t } = useTranslation();
  const next = i18n.language === "en" ? "sr" : "en";
  return (
    <Pressable
      onPress={() => i18n.changeLanguage(next)}
      accessibilityRole="button"
      accessibilityLabel={t("auth.languageToggle")}
      hitSlop={8}
      testID="auth-language-toggle"
    >
      <Text className="font-sans text-faint text-[11px]">
        {next.toUpperCase()}
      </Text>
    </Pressable>
  );
}
