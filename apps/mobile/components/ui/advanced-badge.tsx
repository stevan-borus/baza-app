/**
 * AdvancedBadge — the advanced (hard) session mark: a bare fire glyph 🔥 the eye
 * catches while scanning times. Renders NOTHING when the session isn't marked.
 *
 * Zero chrome by design — no ring, chip, border, background, or word on the
 * card. It rides at the end of a session's time/meta line and MUST NOT change
 * the row height: the glyph carries its own color and sits as a single Text
 * with no line-height of its own.
 *
 * Dense rows stay wordless; `showLabel` expands the mark to "🔥 Napredni
 * trening" on detail surfaces (the booking sheet), which double as the legend
 * that teaches the glyph — so no persistent legend chrome exists anywhere.
 * Elsewhere the word survives only in the a11y label (and the admin edit
 * switch).
 *
 * Two sizes: "compact" (default, for dense card meta lines) and "detail" (one
 * step up, for detail sheets), tuned to sit optically centered against the
 * surrounding line.
 */
import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "@/components/ui/tokens";

type Size = "compact" | "detail";

const FONT_SIZE: Record<Size, number> = {
  compact: 13,
  detail: 15,
};

export function AdvancedBadge({
  isAdvanced,
  size = "compact",
  showLabel = false,
}: {
  isAdvanced: boolean | undefined;
  size?: Size;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  if (!isAdvanced) return null;

  return (
    <Text
      testID="advanced-badge"
      accessibilityLabel={t("session.advanced.a11yLabel")}
      style={{ fontSize: FONT_SIZE[size] }}
    >
      {t("session.advanced.badge")}
      {showLabel ? (
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: FONT_SIZE[size] - 1,
            color: tokens.muted,
          }}
        >
          {" "}
          {t("session.advanced.a11yLabel")}
        </Text>
      ) : null}
    </Text>
  );
}
