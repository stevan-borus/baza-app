/**
 * Client notification settings — four toggles, each a single-field PATCH.
 *
 * State derives from the preferences query (no setup useEffect). The
 * bookingEmailsEnabled toggle is the courtesy opt-out for booking-change
 * emails; campaignsEnabled is the marketing opt-out (Promocije / novi programi).
 */
import { useQuery } from "@tanstack/react-query";
import { ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { SectionRow } from "@/components/ui/studio";
import {
  notificationsQueries,
  useUpdatePreferencesMutation,
} from "@/lib/queries/notifications-queries-factory";

type PrefKey = "pushEnabled" | "inAppEnabled" | "campaignsEnabled" | "bookingEmailsEnabled";

export default function NotificationSettings() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding(24);
  const prefsQuery = useQuery(notificationsQueries.preferences());
  const updateMutation = useUpdatePreferencesMutation();

  const prefs = prefsQuery.data?.preferences;

  function toggle(key: PrefKey, value: boolean) {
    updateMutation.mutate({ [key]: value });
  }

  const rows: Array<{ key: PrefKey; label: string }> = [
    { key: "pushEnabled", label: t("client.notificationSettings.pushEnabled") },
    { key: "inAppEnabled", label: t("client.notificationSettings.inAppEnabled") },
    { key: "bookingEmailsEnabled", label: t("client.notificationSettings.bookingEmailsEnabled") },
    { key: "campaignsEnabled", label: t("client.notificationSettings.campaignsEnabled") },
  ];

  return (
    <ScreenContainerRaw title={t("client.notificationSettings.title")} headerVariant="detail">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: bottomPad, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionRow title={t("client.notificationSettings.title")} />
        {updateMutation.isError ? (
          <View className="mx-4 bg-danger-soft border border-danger rounded-lg px-3.5 py-2.5">
            <Text className="text-danger text-[13px] font-body-medium">
              {t("client.notificationSettings.saveError")}
            </Text>
          </View>
        ) : null}
        <View className="mx-4">
          {rows.map((row) => (
            <View
              key={row.key}
              className="flex-row items-center justify-between py-4 border-t border-glass-border"
            >
              <Text
                className="font-body-medium text-foreground flex-1 pr-3"
                style={{ fontSize: 15, letterSpacing: -0.1 }}
              >
                {row.label}
              </Text>
              <Switch
                testID={`notification-settings-${row.key}`}
                value={prefs?.[row.key] ?? true}
                onValueChange={(value) => toggle(row.key, value)}
                disabled={!prefs || updateMutation.isPending}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
