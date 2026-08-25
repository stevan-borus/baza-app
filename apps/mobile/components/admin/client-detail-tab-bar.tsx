/**
 * ClientDetailTabBar — three-segment pill strip that pins under the client
 * header card on the detail page. Why a standalone component? The strip is
 * the load-bearing affordance of PR δ — it replaces a flat scroll where
 * "Istorija treninga →" was the last thing on screen, so it needs an
 * isolated unit test that doesn't require mocking the entire detail page.
 *
 * Visual rules: matches the studio FilterChip aesthetic — inverted ink
 * fill on the active segment, hairline-bordered ghost on the others.
 * Differs from <SegmentedControl> in that the strip is content-wrapped (no
 * `flex: 1` segments) and sits flush against the header — the segmented
 * control's rounded outer container felt like a duplicated chrome layer
 * here.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

export type ClientDetailTab = "pregled" | "paketi" | "treninzi" | "beleske";

const TABS: ClientDetailTab[] = ["pregled", "paketi", "treninzi", "beleske"];

export function ClientDetailTabBar({
  active,
  onChange,
}: {
  active: ClientDetailTab;
  onChange: (next: ClientDetailTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Pressable
            key={tab}
            testID={`client-detail-tab-${tab}`}
            onPress={() => onChange(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            aria-selected={isActive}
            android_ripple={null}
            className={`flex-row items-center px-3.5 py-2 rounded-full border active:opacity-80 ${
              isActive
                ? "bg-foreground border-foreground"
                : "border-glass-border"
            }`}
          >
            <Text
              className={
                isActive
                  ? "text-background font-body-semibold"
                  : "text-muted font-body-medium"
              }
              style={{ fontSize: 13, letterSpacing: 0.1 }}
              numberOfLines={1}
            >
              {t(`admin.clientDetail.tabs.${tab}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
