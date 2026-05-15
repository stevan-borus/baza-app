import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GlassCard } from "@/components/ui/glass-card";

type Choice = "yes" | "no";

type Props = {
  value: Choice | null;
  onChange: (next: Choice) => void;
  disabled?: boolean;
};

export function SocialMediaQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <View testID="social-media-question" className="px-6">
      <GlassCard size="md">
        <Text className="text-[15px] text-foreground font-body-semibold leading-5">
          {t("consent.socialMedia.question")}
        </Text>
        <View className="mt-4 flex-row gap-3">
          {(["yes", "no"] as const).map((choice) => {
            const selected = value === choice;
            return (
              <Pressable
                key={choice}
                testID={`social-media-${choice}`}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(choice)}
                className={`flex-1 items-center rounded-xl border px-4 py-3 ${
                  selected
                    ? "border-foreground/40 bg-foreground/10"
                    : "border-foreground/15 bg-transparent"
                } ${disabled ? "opacity-50" : ""}`}
              >
                <Text className="text-[15px] text-foreground font-body-semibold">
                  {t(`consent.socialMedia.${choice}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mt-3 text-[12px] text-muted">
          {t("consent.socialMedia.helper")}
        </Text>
      </GlassCard>
    </View>
  );
}
