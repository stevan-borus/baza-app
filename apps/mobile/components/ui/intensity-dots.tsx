/**
 * IntensityDots — the reusable meter for a session's admin-set intensity.
 *
 * Renders three dots, `intensity` of them filled in the theme accent, the rest
 * as faint outlines. Display-only: it never gates booking or filtering, it just
 * tells a client how hard THIS occurrence is expected to be. Renders NOTHING
 * when there's no marking (null / undefined / 0) — an unmarked session is "not
 * rated", not "easy", so it shows no dots at all.
 *
 * Dots, deliberately not stars (stars read as a quality rating) and not flames
 * (they clash with a reformer-studio brand).
 */
import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "@/components/ui/tokens";

const TOTAL_DOTS = 3;

export function IntensityDots({
  intensity,
  size = 6,
}: {
  intensity: number | null | undefined;
  /** Dot diameter in px. Defaults to a compact 6 for inline card use. */
  size?: number;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  // Unmarked → render nothing. Also guards against any stray out-of-range
  // value slipping through (only 1..3 ever draws filled dots).
  if (intensity == null || intensity < 1) return null;
  const filled = Math.min(Math.round(intensity), TOTAL_DOTS);

  return (
    <View
      testID="intensity-dots"
      accessibilityLabel={t("session.intensity.a11yLabel", {
        value: filled,
        total: TOTAL_DOTS,
      })}
      className="flex-row items-center gap-1"
    >
      {Array.from({ length: TOTAL_DOTS }, (_, i) => {
        const isFilled = i < filled;
        return (
          <View
            key={i}
            testID={`intensity-dot-${i + 1}`}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isFilled ? tokens.accentLight : "transparent",
              borderWidth: isFilled ? 0 : 1,
              borderColor: tokens.faint,
            }}
          />
        );
      })}
    </View>
  );
}
