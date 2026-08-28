import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { GlassCard } from "@/components/ui/glass-card";
import { Icon } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";

/**
 * Tells the user their OS notification permission is off and gives them a way
 * to fix it.
 *
 * A declined permission prompt used to be completely invisible: registration
 * bailed silently, the server logged NO_ACTIVE_PUSH_TOKENS forever, and the
 * user just never heard from the app again. This is deliberately quiet — an
 * inline dismissible card on the inbox (where someone staring at an empty list
 * is exactly the person who needs to know), never a launch-time modal.
 *
 * Reads the permission itself on focus rather than taking it as a prop, so it
 * re-checks when the user comes back from OS settings and disappears on its own
 * once permission is granted.
 */
export function PushPermissionBanner() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const [denied, setDenied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
      let active = true;
      (async () => {
        try {
          const Notifications = await import("expo-notifications");
          const { status } = await Notifications.getPermissionsAsync();
          if (active) setDenied(status !== "granted");
        } catch {
          // Permissions unreadable (simulator / unsupported env) — show nothing
          // rather than a banner the user can't act on.
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  if (!denied || dismissed) return null;

  return (
    <View className="px-6 pt-3" testID="push-permission-banner">
      <GlassCard size="md" accentBorder="left">
        <View className="flex-row gap-3 items-start">
          <View className="items-center justify-center w-9 h-9 rounded-full bg-accent-soft">
            <Icon name="bell-off" size={17} color={tokens.accent} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-[14px] text-foreground font-body-bold">
              {t("notifications.permissionDenied.title")}
            </Text>
            <Text className="text-[13px] text-muted">
              {t("notifications.permissionDenied.body")}
            </Text>
            <View className="flex-row gap-4 mt-2">
              <Pressable
                testID="push-permission-open-settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                accessibilityRole="button"
                accessibilityLabel={t("notifications.permissionDenied.openSettings")}
              >
                <Text className="text-[13px] text-accent font-body-bold">
                  {t("notifications.permissionDenied.openSettings")}
                </Text>
              </Pressable>
              <Pressable
                testID="push-permission-dismiss"
                onPress={() => setDismissed(true)}
                accessibilityRole="button"
                accessibilityLabel={t("notifications.permissionDenied.dismiss")}
              >
                <Text className="text-[13px] text-muted">
                  {t("notifications.permissionDenied.dismiss")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GlassCard>
    </View>
  );
}
