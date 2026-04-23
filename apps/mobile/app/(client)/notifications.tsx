import { useState } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LegendList } from "@legendapp/list";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { ACCENT } from "@/components/ui/tokens";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";

const typeBadgeStatus: Record<string, "success" | "neutral" | "warning"> = {
  BOOKING_CONFIRMED: "success",
  SESSION_UPDATED: "neutral",
  TRAINER_NOTE: "warning",
  GENERAL: "neutral",
};

export default function ClientNotifications() {
  const queryClient = useQueryClient();
  const [showPrefs, setShowPrefs] = useState(false);

  const notificationsQuery = useInfiniteQuery(notificationsQueries.listInfinite());
  const prefsQuery = useQuery(notificationsQueries.preferences());
  const notifications = notificationsQuery.data?.pages.flatMap((p) => p.notifications) ?? [];

  const markReadMutation = useMutation({
    ...notificationsQueries.markAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const updatePrefsMutation = useMutation({
    ...notificationsQueries.updatePreferences(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] }),
  });

  function handleEndReached() {
    if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
      notificationsQuery.fetchNextPage();
    }
  }

  const typeLabelKeys: Record<string, string> = {
    BOOKING_CONFIRMED: "client.notifications.typeBooking",
    SESSION_UPDATED: "client.notifications.typeSession",
    TRAINER_NOTE: "client.notifications.typeNote",
    GENERAL: "client.notifications.typeGeneral",
  };

  const prefs = prefsQuery.data?.preferences;
  const { t } = useTranslation();
  const dateLocale = getDateLocale();

  return (
    <ScreenContainerRaw>
      <View className="px-6 pb-3 gap-4">
        <View className="flex-row justify-between items-center">
          <SectionHeader title={t("client.notifications.title")} />
          <Pressable onPress={() => setShowPrefs(true)}>
            <FontAwesome name="cog" size={22} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>

      {notificationsQuery.isError ? (
        <View className="px-6">
          <ErrorState message={t("client.notifications.error")} />
        </View>
      ) : null}

      {notifications.length === 0 && !notificationsQuery.isLoading ? (
        <View className="px-6">
          <EmptyState title={t("client.notifications.empty")} />
        </View>
      ) : null}

      <View className="flex-1 px-6">
        <LegendList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: Notification }) => {
            const isUnread = !item.readAt;
            const messageKey =
              item.payload &&
              typeof item.payload === "object" &&
              "messageKey" in item.payload &&
              typeof item.payload.messageKey === "string"
                ? item.payload.messageKey
                : null;
            const displayTitle = messageKey ? t(`${messageKey}.title`) : item.title;
            const displayBody = messageKey ? t(`${messageKey}.body`) : item.body;
            return (
              <Pressable
                onPress={() => {
                  if (isUnread) markReadMutation.mutate(item.id);
                }}
              >
                <View className="py-1.5">
                  <GlassCard accentBorder={isUnread ? "left" : undefined}>
                    <View className="flex-col gap-2" style={{ opacity: isUnread ? 1 : 0.7 }}>
                      <View className="flex-row justify-between items-center">
                        <Badge
                          status={typeBadgeStatus[item.type] ?? "neutral"}
                        >
                          {typeLabelKeys[item.type]
                            ? t(typeLabelKeys[item.type])
                            : item.type}
                        </Badge>
                        <Text className="text-[11px] text-muted">
                          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
                        </Text>
                      </View>
                      <Text
                        className="text-[15px] text-foreground"
                        style={{ fontWeight: isUnread ? "600" : "400" }}
                      >
                        {displayTitle}
                      </Text>
                      <Text className="text-[13px] text-muted">
                        {displayBody}
                      </Text>
                    </View>
                  </GlassCard>
                </View>
              </Pressable>
            );
          }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            notificationsQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : null
          }
          estimatedItemSize={120}
        />
      </View>

      <AppSheet open={showPrefs} onOpenChange={setShowPrefs}>
        <View className="flex-col gap-5">
          <Text
            className="text-foreground font-bold"
            style={{ fontSize: 24, letterSpacing: -0.3 }}
          >
            {t("client.notifications.settingsTitle")}
          </Text>
          {prefs ? (
            <GlassCard>
              <View className="flex-col gap-2">
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-[15px] text-foreground">{t("client.notifications.pushEnabled")}</Text>
                  <Switch
                    value={prefs.pushEnabled}
                    onValueChange={(v) => updatePrefsMutation.mutate({ pushEnabled: v })}
                    trackColor={{ false: "#404040", true: ACCENT }}
                  />
                </View>
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-[15px] text-foreground">{t("client.notifications.inAppEnabled")}</Text>
                  <Switch
                    value={prefs.inAppEnabled}
                    onValueChange={(v) => updatePrefsMutation.mutate({ inAppEnabled: v })}
                    trackColor={{ false: "#404040", true: ACCENT }}
                  />
                </View>
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-[15px] text-foreground">{t("client.notifications.marketing")}</Text>
                  <Switch
                    value={prefs.marketingOptIn}
                    onValueChange={(v) => updatePrefsMutation.mutate({ marketingOptIn: v })}
                    trackColor={{ false: "#404040", true: ACCENT }}
                  />
                </View>
              </View>
            </GlassCard>
          ) : (
            <EmptyState title={t("client.notifications.loadingPrefs")} />
          )}
        </View>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
