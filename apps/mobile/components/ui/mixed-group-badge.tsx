/**
 * MixedGroupBadge — the mixed-group session mark: an accent-tinted ♀♂ text
 * pair telling clients that occurrence trains men and women together. Renders
 * NOTHING when the session isn't marked.
 *
 * Deliberately mirrors IntermediateBadge, including the reason it uses text
 * glyphs rather than the ⚧/👫 emoji: an emoji carries its own uncontrollable
 * color, and this mark rides the same time/meta line as the brand-green ★. It
 * shares the ★'s accent tint so the two read as one system of session marks —
 * they're told apart by glyph shape, not by color.
 *
 * Dense rows stay wordless; `showLabel` expands the mark to "♀♂ Mešana grupa"
 * on detail surfaces (the booking sheet), which double as the legend that
 * teaches the glyph — so no persistent legend chrome exists anywhere.
 * Elsewhere the words survive only in the a11y label and the admin edit switch.
 *
 * Sizes match IntermediateBadge so both marks sit on one line without
 * changing the row height.
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

export function MixedGroupBadge({
  isMixedGroup,
  size = "compact",
  showLabel = false,
}: {
  isMixedGroup: boolean | undefined;
  size?: Size;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  if (!isMixedGroup) return null;

  return (
    <Text
      testID="mixed-group-badge"
      accessibilityLabel={t("session.mixedGroup.a11yLabel")}
      style={{ fontSize: FONT_SIZE[size], color: tokens.accentLight }}
    >
      {t("session.mixedGroup.badge")}
      {showLabel ? (
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: FONT_SIZE[size] - 1,
            color: tokens.muted,
          }}
        >
          {" "}
          {t("session.mixedGroup.label")}
        </Text>
      ) : null}
    </Text>
  );
}
