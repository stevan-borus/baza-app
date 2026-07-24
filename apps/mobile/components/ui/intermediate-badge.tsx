/**
 * IntermediateBadge — the intermediate session mark: a
 * brand-green ★ text glyph the eye catches while scanning times. Renders
 * NOTHING when the session isn't marked.
 *
 * The mark is a text star (not an emoji) precisely so it can be tinted the
 * theme accent — an emoji carries its own uncontrollable color. It rides at
 * the end of a session's time/meta line and MUST NOT change the row height:
 * the glyph carries its own color and sits as a single Text with no
 * line-height of its own.
 *
 * Dense rows stay wordless; `showLabel` expands the mark to "★ Intermediate"
 * on detail surfaces (the booking sheet), which double as the legend that
 * teaches the star — so no persistent legend chrome exists anywhere. Elsewhere
 * the word survives only in the a11y label (and the admin edit switch).
 *
 * Two sizes: "compact" (default, for dense card meta lines) and "detail" (one
 * step up, for detail sheets), tuned to sit optically centered against the
 * surrounding line — the ★ renders optically smaller than the fire emoji did,
 * so both sizes are a step larger than the old glyph.
 */
import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "@/components/ui/tokens";

type Size = "compact" | "detail";

const FONT_SIZE: Record<Size, number> = {
  compact: 14,
  detail: 16,
};

export function IntermediateBadge({
  isIntermediate,
  size = "compact",
  showLabel = false,
}: {
  isIntermediate: boolean | undefined;
  size?: Size;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  if (!isIntermediate) return null;

  return (
    <Text
      testID="intermediate-badge"
      accessibilityLabel={t("session.intermediate.a11yLabel")}
      style={{ fontSize: FONT_SIZE[size], color: tokens.accentLight }}
    >
      {t("session.intermediate.badge")}
      {showLabel ? (
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: FONT_SIZE[size] - 1,
            color: tokens.muted,
          }}
        >
          {" "}
          {t("session.intermediate.label")}
        </Text>
      ) : null}
    </Text>
  );
}
