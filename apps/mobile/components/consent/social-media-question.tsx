import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Body } from "@/components/ui/studio";

type Choice = "yes" | "no";

type Props = {
  value: Choice | null;
  onChange: (next: Choice) => void;
  disabled?: boolean;
};

export function SocialMediaQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <View testID="social-media-question" className="gap-3">
      <Body size={14} className="text-foreground">
        {t("consent.socialMedia.question")}
      </Body>
      <View className="flex-row gap-3">
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
              className={`flex-1 h-11 rounded-xl items-center justify-center ${
                selected
                  ? "bg-accent"
                  : "bg-glass border border-glass-border"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <Body
                size={14}
                className={selected ? "text-white" : "text-foreground"}
              >
                {t(`consent.socialMedia.${choice}`)}
              </Body>
            </Pressable>
          );
        })}
      </View>
      <Body size={12}>{t("consent.socialMedia.helper")}</Body>
    </View>
  );
}
