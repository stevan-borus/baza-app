import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View, type TextLayoutEventData, type NativeSyntheticEvent } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { Icon } from "@/components/ui/icon";
import { AppSheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { useThemePreference } from "@/lib/theme-preference";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";
import { useNotificationTapHandler } from "@/lib/notification-tap";
import { shouldOpenDetailSheet } from "@/lib/notification-detail-sheet";
import { clearAppBadge } from "@/lib/badge";
import { PushPermissionBanner } from "@/components/notifications/push-permission-banner";
import { serbianSessionsLabel } from "@baza/i18n";
import dayjs from "dayjs";

type NotificationsInboxContext = "client" | "admin" | "trainer";

type Props = {
  context: NotificationsInboxContext;
  bottomPad?: number;
};

type NotificationGroup = "today" | "yesterday" | "earlier";

type GroupedNotifications = {
  key: NotificationGroup;
  labelKey: string;
  items: Notification[];
};

type ListItem =
  | { kind: "header"; groupKey: NotificationGroup; labelKey: string }
  | { kind: "row"; notification: Notification };

/**
 * Returns the body to display, or null when there is nothing worth rendering.
 *
 * Bodies reach a row from two places and either can be empty:
 * `notification.general.body` is "" in both locales (and GENERAL is the
 * DEFAULT type), and CAMPAIGN bodies are admin free text that never passes
 * through i18n. An empty string used to render as a blank line under the
 * title — a card that looks broken. Null instead means the row renders
 * title-only, which reads as a deliberate short notice.
 */
export function resolveDisplayBody(
  translatedBody: string | null,
  bodyKey: string | null,
  storedBody: string,
): string | null {
  const translated =
    translatedBody && translatedBody !== bodyKey ? translatedBody.trim() : "";
  if (translated.length > 0) return translated;
  const stored = storedBody.trim();
  return stored.length > 0 ? stored : null;
}

/**
 * Below this length a 13px body cannot reach a third line at any supported
 * width, so the hidden truncation-measuring Text is skipped entirely.
 */
const BODY_TRUNCATION_PROBE_MIN_CHARS = 60;

// Stable viewabilityConfig reference — recreating this object on each render
// makes FlatList throw "Changing onViewableItemsChanged on the fly is not
// supported" and can drop events.
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 300,
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

/**
 * Returns the person name a notification is about, if any. Used to swap
 * the type icon for a personal avatar (initials, eventually photo).
 *
 * Whitelist only — random server payload keys shouldn't be probed.
 */
function personNameFromPayload(payload: Notification["payload"]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates = ["clientFullName", "trainerFullName", "userName"] as const;
  for (const key of candidates) {
    const value = p[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Extract a flat `Record<string, string>` of interpolation values from the
 * notification payload so `t(messageKey.body, payload)` can render
 * "Marko Marković je otkazao Reformer pilates (10:00)" rather than the
 * raw literal with `{{clientFullName}}` placeholders.
 *
 * Whitelist only safe scalar fields — we don't want random server payload
 * keys to land inside translation strings.
 */
/**
 * Appends the admin-authored gift note to the body. `resolveDisplayBody`
 * prefers the translated template, which cannot carry free text, so without
 * this the note the admin typed would never reach the client's inbox.
 */
export function appendGiftMessage(
  body: string | null,
  payload: Notification["payload"],
): string | null {
  if (!payload || typeof payload !== "object") return body;
  const note = (payload as Record<string, unknown>).giftMessage;
  if (typeof note !== "string" || note.trim().length === 0) return body;
  const base = body?.trim() ?? "";
  return base.length > 0 ? `${base}\n\n${note.trim()}` : note.trim();
}

function payloadInterpolation(
  payload: Notification["payload"],
  lang: "sr" | "en",
): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const out: Record<string, string> = {};
  const safe = (k: string) => {
    const v = (payload as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  };
  safe("clientFullName");
  safe("classTypeName");
  safe("trainerFullName");
  safe("userName");
  safe("packageTypeName");
  safe("sessionsGranted");
  // Serbian needs three plural forms for "termin"; the app re-renders the
  // body from the locale file, so it derives the count word the same way the
  // server does rather than trusting a stored string.
  const granted = Number((payload as Record<string, unknown>).sessionsGranted);
  if (Number.isFinite(granted)) {
    out.sessionsLabel =
      lang === "en"
        ? Math.abs(granted) === 1
          ? "session"
          : "sessions"
        : serbianSessionsLabel(granted);
  }
  // sessionStartsAt is ISO; render as HH:mm (or HH:mm D.M. if not today).
  const startsAt = (payload as Record<string, unknown>).sessionStartsAt;
  if (typeof startsAt === "string") {
    const d = dayjs(startsAt).locale(lang);
    out.time = dayjs().isSame(d, "day")
      ? d.format("HH:mm")
      : d.format(lang === "en" ? "HH:mm MMM D" : "HH:mm D.M.");
  }
  return out;
}

export function NotificationsInbox({ context, bottomPad = 0 }: Props) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const handleNotificationTap = useNotificationTapHandler();
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();
  // Megaphone badge: green reads well on the light bone canvas, but on the
  // dark-green accentSoft wash it muddies into the badge — flip to the cream
  // foreground in dark mode so it stays legible against the badge in both.
  const campaignIconColor = resolvedTheme === "dark" ? tokens.foreground : tokens.accent;

  // Which body texts overflowed the 2-line clamp, keyed by notification id.
  // Populated by each row's hidden no-clamp measuring Text (see the probe in
  // renderItem) — we can't read this off the clamped Text because iOS reports
  // `onTextLayout` AFTER clamping. A ref (not state) because we only read it
  // inside the tap handler; a body becoming truncated never needs a re-render.
  const truncatedIdsRef = useRef<Set<string>>(new Set());

  // The notification whose full-text detail sheet is open, if any. Holding the
  // notification (not just an id) keeps the sheet's content stable while it
  // animates closed even if the list refetches underneath.
  const [detailNotification, setDetailNotification] = useState<{
    title: string;
    body: string;
    createdAt: string;
    isCampaign: boolean;
  } | null>(null);

  const notificationsQuery = useInfiniteQuery(notificationsQueries.listInfinite());
  const allNotifications =
    notificationsQuery.data?.pages.flatMap((p) => p.notifications) ?? [];

  const markManyReadMutation = useMutation({
    ...notificationsQueries.markManyRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueries.all }),
  });

  // Debounce mark-read calls — viewability events fire rapidly during scroll;
  // batching them into a single request every ~500ms avoids hammering the API.
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flushMarkRead() {
    const ids = Array.from(pendingIdsRef.current);
    pendingIdsRef.current.clear();
    debounceRef.current = null;
    if (ids.length > 0) markManyReadMutation.mutate(ids);
  }

  function handleViewableItemsChanged({
    viewableItems,
  }: {
    viewableItems: Array<{ item: ListItem }>;
  }) {
    for (const v of viewableItems) {
      if (v.item.kind === "row" && !v.item.notification.readAt) {
        pendingIdsRef.current.add(v.item.notification.id);
      }
    }
    if (pendingIdsRef.current.size === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushMarkRead, 500);
  }

  // FlatList throws "Changing onViewableItemsChanged on the fly is not
  // supported" if the prop identity moves between renders, so the list gets a
  // fixed wrapper that forwards to the current render's handler.
  const viewableItemsHandlerRef = useRef(handleViewableItemsChanged);
  viewableItemsHandlerRef.current = handleViewableItemsChanged;
  const onViewableItemsChangedRef = useRef(
    (info: { viewableItems: Array<{ item: ListItem }> }) =>
      viewableItemsHandlerRef.current(info),
  );

  // When the inbox screen comes into focus, mark every currently-loaded
  // unread row as read after a brief delay. Covers the case where the user
  // opens the page, sees their rows on screen, and never scrolls (so
  // `onViewableItemsChanged` never fires). Standard Mail / Slack / Linear
  // inbox pattern. Server filters by userId so IDs are safe to pass.
  //
  // We snapshot via ref so the callback inside useFocusEffect doesn't
  // re-subscribe on every notifications refetch.
  const allNotificationsRef = useRef(allNotifications);
  allNotificationsRef.current = allNotifications;
  // Same for the mutation: `useMutation` returns a fresh object every render,
  // so keeping it in the dependency list would re-run the focus effect on
  // every render — and now that the effect invalidates, that is an endless
  // invalidate → refetch → render loop.
  const markManyReadRef = useRef(markManyReadMutation);
  markManyReadRef.current = markManyReadMutation;
  useFocusEffect(
    useCallback(() => {
      // Tab screens stay mounted, so coming back to this tab neither remounts
      // the list nor refetches it — the newest notification stayed missing
      // until the app was killed. Invalidating the whole `notifications` key
      // refreshes the list and the unread badge together.
      queryClient.invalidateQueries({ queryKey: notificationsQueries.all });
      // Opening the inbox is the user acknowledging the badge — clear the
      // OS-level app icon badge immediately, even if their unread rows
      // haven't yet been written to the server.
      void clearAppBadge();
      const timeout = setTimeout(() => {
        const unreadIds = allNotificationsRef.current
          .filter((n) => !n.readAt)
          .map((n) => n.id);
        if (unreadIds.length > 0) markManyReadRef.current.mutate(unreadIds);
      }, 600);
      return () => clearTimeout(timeout);
    }, [queryClient]),
  );

  function handleEndReached() {
    if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
      notificationsQuery.fetchNextPage();
    }
  }

  const groups = groupByDay(allNotifications);

  const listData: ListItem[] = [];
  for (const group of groups) {
    listData.push({ kind: "header", groupKey: group.key, labelKey: group.labelKey });
    for (const n of group.items) {
      listData.push({ kind: "row", notification: n });
    }
  }

  const emptyKey =
    context === "client"
      ? "client.notifications.empty"
      : "admin.notifications.empty";
  const errorKey =
    context === "client"
      ? "client.notifications.error"
      : "admin.notifications.error";

  return (
    <View style={{ flex: 1 }}>
      {/*
        No entrance animation around the list: an opacity-0 → 1 fade over the
        whole inbox is one more way for the screen to stay blank if the
        animation never settles, and the reported failure mode is an empty page.
      */}
      <View style={{ flex: 1 }}>
        {/*
          Sits above the list rather than inside it: someone looking at an
          empty inbox because push was declined needs to see the fix first.
        */}
        <PushPermissionBanner />

        {notificationsQuery.isLoading ? (
          <View className="px-6 pt-4"><SkeletonList count={3} /></View>
        ) : notificationsQuery.isError ? (
          <View className="px-6 pt-4">
            <ErrorState
              message={t(errorKey)}
              retryLabel={t("common.retry")}
              onRetry={() => notificationsQuery.refetch()}
            />
          </View>
        ) : listData.length === 0 ? (
          <View className="px-6 pt-8"><EmptyState title={t(emptyKey)} /></View>
        ) : null}

        {!notificationsQuery.isLoading && (
          <FlatList
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
              const interp = payloadInterpolation(n.payload, lang);
              // i18next returns the key unchanged when no translation exists —
              // detect that and fall back to the server-stored (already
              // localized) title/body. Avoids leaking literal keys like
              // "notification.birthday_admin_prompt.title" into the UI.
              const titleKey = messageKey ? `${messageKey}.title` : null;
              const bodyKey = messageKey ? `${messageKey}.body` : null;
              const translatedTitle = titleKey ? t(titleKey, interp) : null;
              const translatedBody = bodyKey ? t(bodyKey, interp) : null;
              const displayTitle =
                translatedTitle && translatedTitle !== titleKey
                  ? translatedTitle
                  : n.title;
              // The admin's gift note is free text, so it is not part of the
              // translated template — append it verbatim to whichever body won.
              const displayBody = appendGiftMessage(
                resolveDisplayBody(translatedBody, bodyKey, n.body),
                n.payload,
              );
              const personName = personNameFromPayload(n.payload);
              // Campaigns are studio broadcasts, not transactional pings — they
              // carry a megaphone badge and keep the green accent rail even once
              // read, so they stay recognizable as "from Baza" in the list.
              const isCampaign = n.type === "CAMPAIGN";
              return (
                <Pressable
                  testID={`notification-row-${n.id}-${isUnread ? "unread" : "read"}`}
                  className="px-6 py-1 active:opacity-70"
                  onPress={() => {
                    if (isUnread) markManyReadMutation.mutate([n.id]);
                    const navigated = handleNotificationTap({ type: n.type, payload: n.payload });
                    if (
                      shouldOpenDetailSheet({
                        navigated,
                        bodyTruncated: truncatedIdsRef.current.has(n.id),
                      })
                    ) {
                      setDetailNotification({
                        title: displayTitle,
                        body: displayBody ?? "",
                        createdAt: n.createdAt,
                        isCampaign,
                      });
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={displayTitle}
                >
                  <GlassCard size="md" accentBorder={isUnread || isCampaign ? "left" : undefined}>
                    <View className="flex-row gap-3 items-start">
                      {isCampaign ? (
                        <View
                          testID={`notification-campaign-badge-${n.id}`}
                          className="items-center justify-center w-9 h-9 rounded-full bg-accent-soft"
                        >
                          <Icon name="megaphone" size={17} color={campaignIconColor} />
                        </View>
                      ) : personName ? (
                        <View
                          testID={`notification-avatar-${n.id}`}
                          className="items-center justify-center w-9 h-9 rounded-full bg-accent-soft"
                        >
                          <Text
                            className="text-accent font-body-bold"
                            style={{ fontSize: 12 }}
                          >
                            {initialsFromName(personName)}
                          </Text>
                        </View>
                      ) : null}
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
                        {displayBody ? (
                          <>
                            <Text
                              testID={`notification-body-${n.id}`}
                              className="text-[13px] text-muted"
                              numberOfLines={2}
                            >
                              {displayBody}
                            </Text>
                            {/*
                              Truncation probe. iOS reports `onTextLayout`
                              *after* the `numberOfLines` clamp, so a clamped
                              Text always reports exactly 2 lines — we can't
                              tell "fits in 2" from "clipped to 2". So we
                              measure the SAME text with NO clamp in an
                              absolutely-positioned, invisible twin (out of
                              flow → adds no height, pointer-transparent →
                              never steals the row's tap).

                              Only mounted when the body could plausibly wrap
                              past two lines: below that length the answer is
                              always "not truncated", and skipping the twin
                              keeps the duplicate text-layout pass off most
                              cells of a long list.
                            */}
                            {displayBody.length > BODY_TRUNCATION_PROBE_MIN_CHARS ? (
                              <Text
                                className="text-[13px]"
                                style={{ position: "absolute", left: 0, right: 0, opacity: 0 }}
                                pointerEvents="none"
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                                onTextLayout={(e: NativeSyntheticEvent<TextLayoutEventData>) => {
                                  if (e.nativeEvent.lines.length > 2) truncatedIdsRef.current.add(n.id);
                                  else truncatedIdsRef.current.delete(n.id);
                                }}
                              >
                                {displayBody}
                              </Text>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    </View>
                  </GlassCard>
                </Pressable>
              );
            }}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChangedRef.current}
            viewabilityConfig={VIEWABILITY_CONFIG}
            ListFooterComponent={
              notificationsQuery.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} /> : null
            }
          />
        )}
      </View>

      {/*
        Full-text detail sheet for clamped, destination-less notifications.

        rawContent + fixed snapPoints so the title/timestamp pin as a header and
        ONLY the body scrolls, inside gorhom's own BottomSheetScrollView. The
        default AppSheet wrapper puts everything in one scroll view, which both
        scrolls the title away AND fights the sheet's pan gesture at the top edge
        (scrolling up drags the whole sheet). The bottom-sheet scroll primitive
        composes with the pan: it scrolls content first, panning only once the
        content is already at the top. Same pattern as the campaign client list.
      */}
      <AppSheet
        open={detailNotification !== null}
        onOpenChange={(next) => {
          if (!next) setDetailNotification(null);
        }}
        rawContent
        snapPoints={["60%"]}
      >
        {detailNotification ? (
          <View testID="notification-detail-sheet" style={{ flex: 1 }}>
            {/*
              Pinned header. Campaigns read as a branded "studio dispatch": the
              title is set in the studio's Fraunces display face with an accent
              hairline below it, so it feels like an in-app letter rather than a
              transactional alert. No megaphone/"from the studio" chrome here —
              the whole app IS the one studio, and a lone badge floats awkwardly;
              the display type + rule carry the editorial tone on their own. The
              megaphone lives on the inbox row, where it's anchored to the title.
            */}
            <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
              <Text
                className={
                  detailNotification.isCampaign
                    ? "text-[24px] text-foreground font-display leading-[30px]"
                    : "text-[18px] text-foreground font-body-bold"
                }
              >
                {detailNotification.title}
              </Text>

              <Text className="text-[12px] text-muted mt-1">
                {formatRelativeTime(detailNotification.createdAt, lang)}
              </Text>

              <View
                className={detailNotification.isCampaign ? "h-px bg-accent-soft mt-4" : "h-px bg-divider mt-3"}
              />
            </View>

            <BottomSheetScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const paragraphs = detailNotification.body
                  .split(/\n{2,}/)
                  .map((para) => para.trim())
                  .filter(Boolean);
                // An all-whitespace body would filter down to zero paragraphs
                // and render an empty sheet under the title. The sheet only
                // opens for clamped bodies today, so this is a guard rather
                // than a live path — but it makes "empty sheet" unreachable.
                if (paragraphs.length === 0) {
                  return (
                    <Text className="text-[15px] text-muted leading-[24px]">
                      {t("notifications.noDetails")}
                    </Text>
                  );
                }
                return paragraphs.map((para, i) => (
                  <Text
                    key={i}
                    className={`text-[15px] text-foreground leading-[24px] ${i > 0 ? "mt-3" : ""}`}
                  >
                    {para}
                  </Text>
                ));
              })()}
            </BottomSheetScrollView>
          </View>
        ) : null}
      </AppSheet>
    </View>
  );
}

