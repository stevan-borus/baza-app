import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Body } from "@/components/ui/studio";
import { GlassCard } from "@/components/ui/glass-card";

type Choice = "yes" | "no";

type Props = {
  value: Choice | null;
  onChange: (next: Choice) => void;
  disabled?: boolean;
};

/**
 * Consent-gate variant of the social-media question. Uses an explicit
 * Da / Ne radio pair (not a Switch) because the gate semantics require
 * the user to record a discrete decision — "no" is a valid recorded
 * choice that unblocks Continue, not just the absence of "yes". A
 * Switch can only toggle yes↔no relative to its current value, which
 * is a footgun in this flow.
 */
export function SocialMediaQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <View testID="social-media-question">
      <GlassCard size="md">
        <Body size={15} className="text-foreground">
          {t("consent.socialMedia.toggleLabel")}
        </Body>
        <Body size={12} className="mt-1">
          {t("consent.socialMedia.question")}
        </Body>
        <View className="mt-3 flex-row gap-3">
          {(["yes", "no"] as const).map((choice) => {
            const selected = value === choice;
            return (
              <Pressable
                key={choice}
                testID={`social-media-${choice}`}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                aria-checked={selected}
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
        <Body size={12} className="mt-3">
          {t("consent.socialMedia.helper")}
        </Body>
      </GlassCard>
    </View>
  );
}
