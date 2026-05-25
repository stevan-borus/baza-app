import { Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Body } from "@/components/ui/studio";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";

type Choice = "yes" | "no";

type Props = {
  value: Choice | null;
  onChange: (next: Choice) => void;
  disabled?: boolean;
};

export function SocialMediaQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const isOn = value === "yes";

  return (
    <View testID="social-media-question">
      <GlassCard size="md">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Body size={15} className="text-foreground">
              {t("consent.socialMedia.toggleLabel")}
            </Body>
            <Body size={12} className="mt-0.5">
              {t("consent.socialMedia.question")}
            </Body>
          </View>
          <Switch
            testID={isOn ? "social-media-yes" : "social-media-no"}
            value={isOn}
            disabled={disabled}
            onValueChange={(v) => onChange(v ? "yes" : "no")}
            accessibilityLabel={t("consent.socialMedia.toggleLabel")}
            trackColor={{
              false: tokens.glassStrong,
              true: tokens.accent,
            }}
          />
        </View>
        <Body size={12} className="mt-3">
          {t("consent.socialMedia.helper")}
        </Body>
      </GlassCard>
    </View>
  );
}
