import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Switch, Text, View } from "react-native";
import { AppSheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { Icon } from "@/components/ui/icon";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotificationsPreferencesSheet({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  const prefsQuery = useQuery(notificationsQueries.preferences());
  const prefs = prefsQuery.data?.preferences;

  const updatePrefsMutation = useMutation({
    ...notificationsQueries.updatePreferences(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] }),
  });

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-5">
        <Text className="text-foreground font-body-bold" style={{ fontSize: 24, letterSpacing: -0.3 }}>
          {t("client.notifications.settingsTitle")}
        </Text>
        {prefs ? (
          <View className="flex-col">
            <View className="flex-row justify-between items-center py-3 border-b border-glass-border">
              <View className="flex-row items-center gap-3">
                <View style={{ width: 20, alignItems: "center" }}>
                  <Icon name="bell" size={16} color={tokens.accent} />
                </View>
                <Text className="text-[15px] text-foreground">{t("client.notifications.pushEnabled")}</Text>
              </View>
              <Switch
                value={prefs.pushEnabled}
                onValueChange={(v) => updatePrefsMutation.mutate({ pushEnabled: v })}
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <View className="flex-row justify-between items-center py-3">
              <View className="flex-row items-center gap-3">
                <View style={{ width: 20, alignItems: "center" }}>
                  <Icon name="mobile" size={20} color={tokens.accent} />
                </View>
                <Text className="text-[15px] text-foreground">{t("client.notifications.inAppEnabled")}</Text>
              </View>
              <Switch
                value={prefs.inAppEnabled}
                onValueChange={(v) => updatePrefsMutation.mutate({ inAppEnabled: v })}
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
          </View>
        ) : (
          <EmptyState title={t("client.notifications.loadingPrefs")} />
        )}
      </View>
    </AppSheet>
  );
}
