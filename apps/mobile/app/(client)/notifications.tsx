/**
 * Client Notifications — "Inbox" redesign
 * Linear-style grouped inbox with unread accent borders, day-group sticky headers,
 * icon-per-type, SegmentedControl All/Unread filter, and MotiView entry stagger.
 */

import { useMemo, useState } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { SectionLabel } from "@/components/ui/typography";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";
import dayjs from "dayjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const TYPE_LABEL_KEYS: Record<string, string> = {
  BOOKING_CONFIRMED: "client.notifications.typeBooking",
  SESSION_UPDATED: "client.notifications.typeSession",
  TRAINER_NOTE: "client.notifications.typeNote",
  GENERAL: "client.notifications.typeGeneral",
};

// Read/unread icon colors are theme-driven inside the component (resolved
// from `useThemeTokens()`); module-level constants would not flip with the
// active theme.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GroupedNotifications = {
  key: NotificationGroup;
  labelKey: string;
  items: Notification[];
};

function groupByDay(notifications: Notification[]): GroupedNotifications[] {
  const today = dayjs().startOf("day");
  const yesterday = today.subtract(1, "day");

  const buckets: Record<NotificationGroup, Notification[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const n of notifications) {
    const d = dayjs(n.createdAt).startOf("day");
    if (d.isSame(today)) {
      buckets.today.push(n);
    } else if (d.isSame(yesterday)) {
      buckets.yesterday.push(n);
    } else {
      buckets.earlier.push(n);
    }
  }

  const ORDER: NotificationGroup[] = ["today", "yesterday", "earlier"];
  const LABEL_KEYS: Record<NotificationGroup, string> = {
    today: "client.notifications.groupToday",
    yesterday: "client.notifications.groupYesterday",
    earlier: "client.notifications.groupEarlier",
  };

  return ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    key: k,
    labelKey: LABEL_KEYS[k],
    items: buckets[k],
  }));
}

/**
 * Relative time label: localized via dayjs (e.g. "2h ago" / "pre 2 sata").
 * `lang` is forced onto the dayjs instance so the label updates immediately
 * when the user switches locales — without it, fresh dayjs() calls can read
 * a stale global locale on the first re-render.
 */
function formatRelativeTime(createdAt: string, lang: "sr" | "en"): string {
  const d = dayjs(createdAt).locale(lang);
  const diffDays = dayjs().diff(d, "day");
  if (diffDays < 7) return d.fromNow();
  return d.format(lang === "en" ? "MMM D" : "D. MMM");
}

function iconForType(type: string): string {
  return TYPE_ICON[type] ?? "info-circle";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientNotifications() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [showPrefs, setShowPrefs] = useState(false);
  const ICON_COLOR_UNREAD = tokens.accent;
  const ICON_COLOR_READ = tokens.faint;

  const notificationsQuery = useInfiniteQuery(notificationsQueries.listInfinite());
  const prefsQuery = useQuery(notificationsQueries.preferences());
  const allNotifications = notificationsQuery.data?.pages.flatMap((p) => p.notifications) ?? [];

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

  const groups = useMemo(() => groupByDay(allNotifications), [allNotifications]);

  const prefs = prefsQuery.data?.preferences;

  // Build a flat list with section headers interleaved for LegendList
  type ListItem =
    | { kind: "header"; groupKey: NotificationGroup; labelKey: string }
    | { kind: "row"; notification: Notification };

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const group of groups) {
      items.push({ kind: "header", groupKey: group.key, labelKey: group.labelKey });
      for (const n of group.items) {
        items.push({ kind: "row", notification: n });
      }
    }
    return items;
  }, [groups]);

  return (
    <ScreenContainerRaw
      title={t("tabs.notifications")}
      rightSlot={
        <HeaderIconButton
          icon="cog"
          onPress={() => setShowPrefs(true)}
          accessibilityLabel={t("client.notifications.settingsTitle")}
        />
      }
    >
      {/* List — stagger 100ms */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 100 }}
        style={{ flex: 1 }}
      >
        {notificationsQuery.isLoading ? (
          <View className="px-6 pt-4">
            <SkeletonList count={3} />
          </View>
        ) : notificationsQuery.isError ? (
          <View className="px-6 pt-4">
            <ErrorState message={t("client.notifications.error")} />
          </View>
        ) : listData.length === 0 ? (
          <View className="px-6 pt-8">
            <EmptyState title={t("client.notifications.empty")} />
          </View>
        ) : null}

        {!notificationsQuery.isLoading && <LegendList
          data={listData}
          keyExtractor={(item) =>
            item.kind === "header" ? `header-${item.groupKey}` : item.notification.id
          }
          contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
          renderItem={({ item }: { item: ListItem }) => {
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
              n.payload &&
              typeof n.payload === "object" &&
              "messageKey" in n.payload &&
              typeof n.payload.messageKey === "string"
                ? n.payload.messageKey
                : null;
            const displayTitle = messageKey ? t(`${messageKey}.title`) : n.title;
            const displayBody = messageKey ? t(`${messageKey}.body`) : n.body;

            return (
              <Pressable
                onPress={() => {
                  if (isUnread) markReadMutation.mutate(n.id);
                }}
              >
                <View className="px-6 py-1">
                  <GlassCard size="md" accentBorder={isUnread ? "left" : undefined}>
                    <View className="flex-row gap-3 items-start">
                      {/* Type icon */}
                      <View className="mt-0.5">
                        <FontAwesome
                          name={iconForType(n.type) as never}
                          size={18}
                          color={isUnread ? ICON_COLOR_UNREAD : ICON_COLOR_READ}
                        />
                      </View>

                      {/* Content */}
                      <View className="flex-1 gap-1">
                        <View className="flex-row justify-between items-center">
                          <Text
                            className="text-[14px] text-foreground flex-1 mr-2"
                            style={{ fontWeight: isUnread ? "700" : "500" }}
                            numberOfLines={1}
                          >
                            {displayTitle}
                          </Text>
                          <Text className="text-[11px] text-muted">
                            {formatRelativeTime(n.createdAt, lang)}
                          </Text>
                        </View>
                        <Text
                          className="text-[13px] text-muted"
                          numberOfLines={2}
                        >
                          {displayBody}
                        </Text>
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
            notificationsQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : null
          }
          estimatedItemSize={90}
        />}
      </MotiView>

      {/* Preferences sheet */}
      <AppSheet open={showPrefs} onOpenChange={setShowPrefs}>
        <View className="flex-col gap-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 24, letterSpacing: -0.3 }}
          >
            {t("client.notifications.settingsTitle")}
          </Text>

          {prefs ? (
            <View className="flex-col">
              {/* Push notifications row */}
              <View className="flex-row justify-between items-center py-3 border-b border-glass-border">
                <View className="flex-row items-center gap-3">
                  <View style={{ width: 20, alignItems: "center" }}>
                    <FontAwesome name="bell" size={16} color={tokens.accent} />
                  </View>
                  <Text className="text-[15px] text-foreground">
                    {t("client.notifications.pushEnabled")}
                  </Text>
                </View>
                <Switch
                  value={prefs.pushEnabled}
                  onValueChange={(v) => updatePrefsMutation.mutate({ pushEnabled: v })}
                  trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
                />
              </View>

              {/* In-app notifications row — last visible row, no bottom border */}
              <View className="flex-row justify-between items-center py-3">
                <View className="flex-row items-center gap-3">
                  <View style={{ width: 20, alignItems: "center" }}>
                    <FontAwesome name="mobile" size={20} color={tokens.accent} />
                  </View>
                  <Text className="text-[15px] text-foreground">
                    {t("client.notifications.inAppEnabled")}
                  </Text>
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
    </ScreenContainerRaw>
  );
}
