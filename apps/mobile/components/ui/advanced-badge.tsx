/**
 * AdvancedBadge — the outlined text badge marking a Session as an advanced
 * (hard) occurrence. Renders NOTHING when the session isn't marked.
 *
 * Reads "stamped/sealed" via the outline treatment alone: an accent-colored
 * border around transparent fill, normal-case "Napredno" text. Deliberately
 * NOT rotated, NOT a circular seal graphic, NOT distressed — those fight the
 * glass aesthetic. Deliberately NOT levels/stars/dots — the marking is binary
 * (admins think "this one's hard", not in grades).
 *
 * Two sizes: "compact" (default, for inline card rows) and "detail" (one step
 * up, for detail sheets). Follows the Badge/GlassCard idioms.
 */
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "@/components/ui/tokens";

type Size = "compact" | "detail";

const SIZES: Record<Size, { paddingH: number; paddingV: number; fontSize: number; radius: number }> = {
  compact: { paddingH: 8, paddingV: 2, fontSize: 11, radius: 6 },
  detail: { paddingH: 11, paddingV: 4, fontSize: 13, radius: 8 },
};

export function AdvancedBadge({
  isAdvanced,
  size = "compact",
}: {
  isAdvanced: boolean | undefined;
  size?: Size;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  if (!isAdvanced) return null;
  const s = SIZES[size];

  return (
    <View
      testID="advanced-badge"
      accessibilityLabel={t("session.advanced.a11yLabel")}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: s.paddingH,
        paddingVertical: s.paddingV,
        borderRadius: s.radius,
        borderWidth: 1,
        // Accent outline over transparent fill — the "stamp" reads from the
        // outline, no fill. accentLight is theme-aware (legible on both the
        // bone-light and warm-dark canvases).
        borderColor: tokens.accentLight,
        backgroundColor: "transparent",
      }}
    >
      <Text
        style={{
          fontFamily: "AlbertSans-SemiBold",
          fontSize: s.fontSize,
          color: tokens.accentLight,
          // Normal case — a small tracking gives the "stamped" feel without
          // uppercasing (owner explicitly rejected uppercase).
          letterSpacing: 0.4,
        }}
      >
        {t("session.advanced.badge")}
      </Text>
    </View>
  );
}
