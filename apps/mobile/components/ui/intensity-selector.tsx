/**
 * IntensitySelector — the admin four-state picker for a single session's
 * intensity marking: none / ● / ●● / ●●● . "None" clears it back to null
 * (unmarked, NOT "easy"). Used inside the session edit sheet; saves like any
 * other session field, no special confirm, editable any time.
 *
 * Levels render as filled dot clusters (matching IntensityDots on the read
 * side) rather than numbers, so the write UI reads the same as what a client
 * sees. Display term is intensity/intenzitet — never difficulty/stars/rating.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";

const LEVELS = [1, 2, 3] as const;
const TOTAL_DOTS = 3;

export type IntensityValue = 1 | 2 | 3 | null;

export function IntensitySelector({
  value,
  onChange,
}: {
  value: IntensityValue;
  onChange: (next: IntensityValue) => void;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  return (
    <View className="gap-2" testID="session-intensity-selector">
      <SectionLabel>{t("session.intensity.label")}</SectionLabel>
      <View className="flex-row gap-2">
        <IntensityOption
          testID="intensity-option-none"
          selected={value == null}
          onPress={() => onChange(null)}
          accessibilityLabel={t("session.intensity.selectorNoneA11y")}
        >
          <Text
            className={`text-sm font-body-semibold ${
              value == null ? "text-white" : "text-muted"
            }`}
          >
            {t("session.intensity.none")}
          </Text>
        </IntensityOption>
        {LEVELS.map((level) => {
          const selected = value === level;
          return (
            <IntensityOption
              key={level}
              testID={`intensity-option-${level}`}
              selected={selected}
              onPress={() => onChange(level)}
              accessibilityLabel={t("session.intensity.selectorLevelA11y", {
                value: level,
                total: TOTAL_DOTS,
              })}
            >
              <View className="flex-row items-center gap-1">
                {Array.from({ length: TOTAL_DOTS }, (_, i) => {
                  const filled = i < level;
                  const dotColor = selected
                    ? filled
                      ? "#ffffff"
                      : "rgba(255,255,255,0.4)"
                    : filled
                      ? tokens.accentLight
                      : "transparent";
                  return (
                    <View
                      key={i}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: dotColor,
                        borderWidth: filled ? 0 : 1,
                        borderColor: selected
                          ? "rgba(255,255,255,0.4)"
                          : tokens.faint,
                      }}
                    />
                  );
                })}
              </View>
            </IntensityOption>
          );
        })}
      </View>
    </View>
  );
}

function IntensityOption({
  selected,
  onPress,
  accessibilityLabel,
  testID,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // aria-pressed is the correct ARIA for a toggle button — RNW forwards
      // aria-* props verbatim, and (unlike accessibilityState.selected) it
      // surfaces on role="button" so assistive tech announces the active pick.
      aria-pressed={selected}
      accessibilityLabel={accessibilityLabel}
      className={`flex-1 h-11 rounded-2xl border items-center justify-center ${
        selected ? "border-accent bg-accent" : "border-glass-border bg-glass"
      }`}
    >
      {children}
    </Pressable>
  );
}
