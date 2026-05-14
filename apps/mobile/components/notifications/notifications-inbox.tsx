import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";
import dayjs from "dayjs";

type NotificationsInboxContext = "client" | "admin";

type Props = {
  context: NotificationsInboxContext;
  bottomPad?: number;
};

type NotificationGroup = "today" | "yesterday" | "earlier";

const TYPE_ICON: Record<string, string> = {
  BOOKING_CONFIRMED: "calendar-check-o",
  BOOKING_CANCELED: "times-circle",
  SESSION_CANCELED: "times-circle",
  SESSION_UPDATED: "refresh",
  TRAINER_NOTE: "sticky-note-o",
  SESSION_REMINDER: "bell",
  PACKAGE_EXPIRING: "gift",
  SPOT_FROM_WAITLIST: "star",
  GENERAL: "info-circle",
};

type GroupedNotifications = {
  key: NotificationGroup;
  labelKey: string;
  items: Notification[];
};

function groupByDay(notifications: Notification[]): GroupedNotifications[] {
  const today = dayjs().startOf("day");
  const yesterday = today.subtract(1, "day");
  const buckets: Record<NotificationGroup, Notification[]> = { today: [], yesterday: [], earlier: [] };
  for (const n of notifications) {
    const d = dayjs(n.createdAt).startOf("day");
    if (d.isSame(today)) buckets.today.push(n);
    else if (d.isSame(yesterday)) buckets.yesterday.push(n);
    else buckets.earlier.push(n);
  }
  const ORDER: NotificationGroup[] = ["today", "yesterday", "earlier"];
  const LABEL_KEYS: Record<NotificationGroup, string> = {
    today: "notifications.groupToday",
    yesterday: "notifications.groupYesterday",
    earlier: "notifications.groupEarlier",
  };
  return ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    key: k,
    labelKey: LABEL_KEYS[k],
    items: buckets[k],
  }));
}

function formatRelativeTime(createdAt: string, lang: "sr" | "en"): string {
  const d = dayjs(createdAt).locale(lang);
  const diffDays = dayjs().diff(d, "day");
  if (diffDays < 7) return d.fromNow();
  return d.format(lang === "en" ? "MMM D" : "D. MMM");
}

function iconForType(type: string): string {
  return TYPE_ICON[type] ?? "info-circle";
}

export function NotificationsInbox({ context, bottomPad = 0 }: Props) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();

  const notificationsQuery = useInfiniteQuery(notificationsQueries.listInfinite());
  const allNotifications = notificationsQuery.data?.pages.flatMap((p) => p.notifications) ?? [];

  const markReadMutation = useMutation({
    ...notificationsQueries.markAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleEndReached() {
    if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
      notificationsQuery.fetchNextPage();
    }
  }

  const groups = groupByDay(allNotifications);

  type ListItem =
    | { kind: "header"; groupKey: NotificationGroup; labelKey: string }
    | { kind: "row"; notification: Notification };

  const listData: ListItem[] = [];
  for (const group of groups) {
    listData.push({ kind: "header", groupKey: group.key, labelKey: group.labelKey });
    for (const n of group.items) {
      listData.push({ kind: "row", notification: n });
    }
  }

  const ICON_COLOR_UNREAD = tokens.accent;
  const ICON_COLOR_READ = tokens.faint;
  const emptyKey = context === "admin" ? "admin.notifications.empty" : "client.notifications.empty";
  const errorKey = context === "admin" ? "admin.notifications.error" : "client.notifications.error";

  return (
    <View style={{ flex: 1 }}>
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 100 }}
        style={{ flex: 1 }}
      >
        {notificationsQuery.isLoading ? (
          <View className="px-6 pt-4"><SkeletonList count={3} /></View>
        ) : notificationsQuery.isError ? (
          <View className="px-6 pt-4"><ErrorState message={t(errorKey)} /></View>
        ) : listData.length === 0 ? (
          <View className="px-6 pt-8"><EmptyState title={t(emptyKey)} /></View>
        ) : null}

        {!notificationsQuery.isLoading && (
          <LegendList
            data={listData}
            keyExtractor={(item) => (item.kind === "header" ? `header-${item.groupKey}` : item.notification.id)}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
            renderItem={({ item }) => {
              if (item.kind === "header") {
                return (
                  <View className="px-6 pt-4 pb-1">
                    <SectionLabel>{t(item.labelKey)}</SectionLabel>
                  </View>
                );
              }
              const { notification: n } = item;
              const isUnread = !n.readAt;
              const messageKey =
                n.payload && typeof n.payload === "object" && "messageKey" in n.payload && typeof n.payload.messageKey === "string"
                  ? n.payload.messageKey
                  : null;
              const displayTitle = messageKey ? t(`${messageKey}.title`) : n.title;
              const displayBody = messageKey ? t(`${messageKey}.body`) : n.body;
              return (
                <Pressable
                  testID={`notification-row-${n.id}-${isUnread ? "unread" : "read"}`}
                  onPress={() => { if (isUnread) markReadMutation.mutate(n.id); }}
                >
                  <View className="px-6 py-1">
                    <GlassCard size="md" accentBorder={isUnread ? "left" : undefined}>
                      <View className="flex-row gap-3 items-start">
                        <View className="mt-0.5">
                          <FontAwesome
                            name={iconForType(n.type) as never}
                            size={18}
                            color={isUnread ? ICON_COLOR_UNREAD : ICON_COLOR_READ}
                          />
                        </View>
                        <View className="flex-1 gap-1">
                          <View className="flex-row justify-between items-center">
                            <Text
                              className="text-[14px] text-foreground flex-1 mr-2"
                              style={{ fontWeight: isUnread ? "700" : "500" }}
                              numberOfLines={1}
                            >
                              {displayTitle}
                            </Text>
                            <Text className="text-[11px] text-muted">{formatRelativeTime(n.createdAt, lang)}</Text>
                          </View>
                          <Text className="text-[13px] text-muted" numberOfLines={2}>{displayBody}</Text>
                        </View>
                      </View>
                    </GlassCard>
                  </View>
                </Pressable>
              );
            }}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              notificationsQuery.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} /> : null
            }
            estimatedItemSize={90}
          />
        )}
      </MotiView>
    </View>
  );
}
