import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/ui/tabs";
import { setLocale, type Locale } from "@/lib/i18n";

/**
 * Inline language switcher with segmented-control-style buttons.
 * Syncs chosen locale to API (notification preferences) so push/in-app notifications use it.
 */
export function LanguageSwitcher({
  onSelectLocale,
}: {
  onSelectLocale?: (locale: Locale) => void;
} = {}) {
  const { t, i18n } = useTranslation();
  const current: Locale = (i18n.language?.startsWith("sr") ? "sr" : "en") as Locale;

  const handleLocale = (locale: Locale) => {
    setLocale(locale);
    onSelectLocale?.(locale);
  };

  return (
    <SegmentedControl
      value={current}
      onValueChange={(locale) => handleLocale(locale as Locale)}
      segments={[
        { value: "sr", label: t("common.languageSr") },
        { value: "en", label: t("common.languageEn") },
      ]}
    />
  );
}
