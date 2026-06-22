import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmSheet } from "./confirm-sheet";
import { GlassCard } from "./glass-card";
import { Button } from "./button";
import { useAppUpdates } from "@/lib/app-updates/use-app-updates";

/**
 * Renders the right update prompt for the current app-update state:
 *
 *   - "ota" / "store-soft" → a dismissible ConfirmSheet ("Later" / action)
 *   - "store-required"     → a non-dismissible full-screen overlay; the user
 *                            can only tap "Update now" (opens the store)
 *   - "none"               → nothing
 *
 * Mounted once near the navigation root. The whole thing is inert on web / dev
 * / Expo Go because useAppUpdates() never leaves "none" there.
 */
export function AppUpdateGate() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { prompt, apply, dismiss } = useAppUpdates();

  if (prompt === "store-required") {
    return (
      <View
        className="absolute inset-0 z-50 bg-background items-center justify-center px-6"
        accessibilityViewIsModal
        accessibilityLabel={t("updates.a11yUpdateRequired")}
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="update-required-overlay"
      >
        <GlassCard size="lg" className="w-full max-w-md">
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-display"
              style={{ fontSize: 22, lineHeight: 28 }}
            >
              {t("updates.storeRequiredTitle")}
            </Text>
            <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
              {t("updates.storeRequiredBody")}
            </Text>
            <Button testID="update-required-cta" onPress={apply} className="mt-2">
              {t("updates.updateNow")}
            </Button>
          </View>
        </GlassCard>
      </View>
    );
  }

  const dismissible = prompt === "ota" || prompt === "store-soft";
  const isOta = prompt === "ota";

  return (
    <ConfirmSheet
      open={dismissible}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      tone="primary"
      testID="update-prompt-cta"
      title={isOta ? t("updates.otaReadyTitle") : t("updates.storeOptionalTitle")}
      message={isOta ? t("updates.otaReadyBody") : t("updates.storeOptionalBody")}
      confirmLabel={isOta ? t("updates.restartNow") : t("updates.update")}
      cancelLabel={t("updates.later")}
      onConfirm={apply}
    />
  );
}
