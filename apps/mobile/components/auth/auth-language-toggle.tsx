import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * sr ↔ en toggle for auth-screen legal strips. Shows the *current* locale
 * as a flag emoji; tap flips to the other. Once authenticated, regular
 * preferredLocale persistence kicks in via ProfileSheet's LanguageSwitcher.
 */
export function AuthLanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = i18n.language === "en" ? "en" : "sr";
  const next = current === "en" ? "sr" : "en";
  const flag = current === "sr" ? "🇷🇸" : "🇬🇧";
  return (
    <Pressable
      onPress={() => i18n.changeLanguage(next)}
      accessibilityRole="button"
      accessibilityLabel={t("auth.languageToggle")}
      hitSlop={8}
      testID="auth-language-toggle"
    >
      <Text style={{ fontSize: 16, lineHeight: 20 }}>{flag}</Text>
    </Pressable>
  );
}
