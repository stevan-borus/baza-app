import { useState } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Switch } from "react-native";
import { LegendList } from "@legendapp/list";
import { Text, XStack, YStack } from "tamagui";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";

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
      <YStack px="$5" pb="$3" gap="$3">
        <XStack justify="space-between" items="center">
          <SectionHeader title={t("client.notifications.title")} />
          <Button
            variant="ghost"
            size="small"
            onPress={() => setShowPrefs(true)}
          >
            {t("client.notifications.settings")}
          </Button>
        </XStack>
      </YStack>

      {notificationsQuery.isError ? (
        <YStack px="$5">
          <ErrorState message={t("client.notifications.error")} />
        </YStack>
      ) : null}

      {notifications.length === 0 && !notificationsQuery.isLoading ? (
        <YStack px="$5">
          <EmptyState title={t("client.notifications.empty")} />
        </YStack>
      ) : null}

      <YStack flex={1} px="$5">
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
                <YStack py="$1.5">
                  <Card>
                    <YStack
                      gap="$2"
                      opacity={isUnread ? 1 : 0.7}
                    >
                      <XStack justify="space-between" items="center">
                        <Badge
                          variant={isUnread ? "soft" : "soft"}
                          color={isUnread ? "$accent3" : "$backgroundHover"}
                        >
                          {typeLabelKeys[item.type]
                            ? t(typeLabelKeys[item.type])
                            : item.type}
                        </Badge>
                        <Text fontSize="$1" color="$color9">
                          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
                        </Text>
                      </XStack>
                      <Text fontWeight={isUnread ? "600" : "400"} fontSize="$3" color="$color">
                        {displayTitle}
                      </Text>
                      <Text fontSize="$2" color="$color10">
                        {displayBody}
                      </Text>
                    </YStack>
                    {isUnread ? (
                      <YStack
                        position="absolute"
                        l={0}
                        t={12}
                        b={12}
                        style={{ width: 3 }}
                        bg="$accent1"
                        rounded={999}
                      />
                    ) : null}
                  </Card>
                </YStack>
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
      </YStack>

      <AppSheet open={showPrefs} onOpenChange={setShowPrefs}>
        <YStack gap="$5">
          <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
            {t("client.notifications.settingsTitle")}
          </Text>
          {prefs ? (
            <Card>
              <YStack gap="$2">
                <XStack justify="space-between" items="center" py="$2">
                  <Text fontSize="$3" color="$color">{t("client.notifications.pushEnabled")}</Text>
                  <Switch
                    value={prefs.pushEnabled}
                    onValueChange={(v) => updatePrefsMutation.mutate({ pushEnabled: v })}
                    trackColor={{ false: "#404040", true: "#22c55e" }}
                  />
                </XStack>
                <XStack justify="space-between" items="center" py="$2">
                  <Text fontSize="$3" color="$color">{t("client.notifications.inAppEnabled")}</Text>
                  <Switch
                    value={prefs.inAppEnabled}
                    onValueChange={(v) => updatePrefsMutation.mutate({ inAppEnabled: v })}
                    trackColor={{ false: "#404040", true: "#22c55e" }}
                  />
                </XStack>
                <XStack justify="space-between" items="center" py="$2">
                  <Text fontSize="$3" color="$color">{t("client.notifications.marketing")}</Text>
                  <Switch
                    value={prefs.marketingOptIn}
                    onValueChange={(v) => updatePrefsMutation.mutate({ marketingOptIn: v })}
                    trackColor={{ false: "#404040", true: "#22c55e" }}
                  />
                </XStack>
              </YStack>
            </Card>
          ) : (
            <EmptyState title={t("client.notifications.loadingPrefs")} />
          )}
        </YStack>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
