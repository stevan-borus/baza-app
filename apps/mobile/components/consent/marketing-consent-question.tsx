import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Body } from "@/components/ui/studio";
import { GlassCard } from "@/components/ui/glass-card";

type Props = {
  /** null = undecided. Nothing is pre-selected — silence is not consent. */
  value: boolean | null;
  onChange: (accepted: boolean) => void;
  disabled?: boolean;
};

/**
 * Marketing-consent step for the consent gate.
 *
 * Its own card, never a row inside the documents card: ZZPL čl. 15 requires a
 * consent request bundled with other matters to be presented so it is
 * distinguishable from them, and accepting the terms is not consenting to
 * marketing. Da / Ne radio pair rather than a Switch for the same reason the
 * social-media question uses one — a Switch has to start somewhere, and any
 * starting position that reads as "yes" is the pre-ticked box that ZZPL
 * čl. 4(1)(12) („jasnom potvrdnom radnjom”) rules out.
 */
export function MarketingConsentQuestion({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();

  const choices = [
    { key: "yes" as const, accepted: true, a11y: "consent.marketing.acceptA11y" },
    { key: "no" as const, accepted: false, a11y: "consent.marketing.declineA11y" },
  ];

  return (
    <View testID="marketing-consent-question">
      <GlassCard size="md">
        <Body size={15} className="text-foreground">
          {t("consent.marketing.toggleLabel")}
        </Body>
        <Body size={12} className="mt-1">
          {t("consent.marketing.question")}
        </Body>
        <View className="mt-3 flex-row gap-3">
          {choices.map((choice) => {
            const selected = value === choice.accepted;
            return (
              <Pressable
                key={choice.key}
                testID={`marketing-consent-${choice.key}`}
                accessibilityRole="radio"
                accessibilityLabel={t(choice.a11y)}
                accessibilityState={{ selected, disabled }}
                aria-checked={selected}
                disabled={disabled}
                onPress={() => onChange(choice.accepted)}
                className={`flex-1 h-11 rounded-xl items-center justify-center ${
                  selected ? "bg-accent" : "bg-glass border border-glass-border"
                } ${disabled ? "opacity-50" : ""}`}
              >
                <Body
                  size={14}
                  className={selected ? "text-white" : "text-foreground"}
                >
                  {t(`consent.marketing.${choice.key}`)}
                </Body>
              </Pressable>
            );
          })}
        </View>
        <Body size={12} className="mt-3">
          {t("consent.marketing.helper")}
        </Body>
      </GlassCard>
    </View>
  );
}
