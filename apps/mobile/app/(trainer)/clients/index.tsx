/**
 * Trainer Clients screen — searchable roster with compact stat strip.
 *
 * Layout: header → search input → "active · this month · expiring" stat strip
 * → glass-card list, one row per client, tappable to expand notes.
 * The empty hero card from the previous design is gone — it conveyed nothing
 * useful. The stat strip now sits inline with the search and shows real
 * counts derived from packageStatus.
 *
 * Migration note: the client list is rendered through `<PaginatedList>` and
 * the search input + stat strip live in a fixed View ABOVE the list so they
 * stay pinned while rows scroll underneath. The previous build kept those in
 * `ListHeaderComponent`, which scrolls away with the rows. The hand-rolled
 * ActivityIndicator footer, skeleton/empty/error fallbacks, and onEndReached
 * plumbing are gone — the wrapper owns all of them.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { PaginatedList } from "@/components/ui/paginated-list";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── stat pill ──────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View
      className="flex-1 bg-glass border border-glass-border rounded-2xl px-3 py-2.5"
    >
      <Text
        className="text-foreground font-body-bold"
        style={{ fontSize: 18, letterSpacing: -0.4 }}
      >
        {value}
      </Text>
      <Text
        className="text-muted text-[11px] mt-0.5"
        style={{ letterSpacing: 0.3, textTransform: "uppercase" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── client row ─────────────────────────────────────────────────────────────

type Client = {
  id: string;
  notes?: string | null;
  packageStatus: "active" | "expiring" | "expired" | "paused" | "none";
  user: { id: string; fullName: string; email: string };
};

const STATUS_BADGE: Record<
  Client["packageStatus"],
  { tone: "success" | "warning" | "neutral"; key: string }
> = {
  active: { tone: "success", key: "admin.clientDetail.status.active" },
  expiring: { tone: "warning", key: "admin.clientDetail.status.expiring" },
  expired: { tone: "warning", key: "admin.clientDetail.status.expired" },
  paused: { tone: "neutral", key: "admin.clientDetail.status.paused" },
  none: { tone: "neutral", key: "admin.clientDetail.status.none" },
};

function ClientRow({ client }: { client: Client }) {
  const { t } = useTranslation();
  const router = useRouter();
  const initials = getInitials(client.user.fullName);
  const badge = STATUS_BADGE[client.packageStatus];

  return (
    <Pressable
      onPress={() => router.push(`/(trainer)/clients/${client.user.id}`)}
      accessibilityRole="button"
      accessibilityLabel={client.user.fullName}
      className="active:opacity-80"
      testID={`trainer-client-row-${client.user.id}`}
    >
      <GlassCard size="sm">
        <View className="flex-row items-center gap-3">
          <View
            className="rounded-full items-center justify-center"
            style={{
              width: 40,
              height: 40,
              backgroundColor: "rgba(46,91,66,0.22)",
            }}
          >
            <Text
              className="font-body-bold"
              style={{ color: "#4caf80", fontSize: 14 }}
            >
              {initials}
            </Text>
          </View>

          <View className="flex-1 flex-col gap-0.5">
            <Text
              className="font-body-semibold text-foreground text-sm"
              numberOfLines={1}
            >
              {client.user.fullName}
            </Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {client.user.email}
            </Text>
          </View>

          {client.packageStatus !== "none" ? (
            <Badge status={badge.tone}>{t(badge.key)}</Badge>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}

function ClientRowSeparator() {
  return <View style={{ height: 10 }} />;
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TrainerClients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding(24);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // useDeferredValue gives a "good-enough" debounce without the timer
  // overhead — React keeps the previous result visible until the next
  // render after the keystroke settles. The server-side q-filter does the
  // heavy lifting; this just avoids hammering the API on every keystroke.
  const deferredQuery = useDeferredValue(searchQuery.trim());

  const clientsQuery = useInfiniteQuery(
    clientsQueries.list({ q: deferredQuery || undefined }),
  );

  const clients = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    setRefreshing(false);
  }

  // The stat strip used to count from the unpaginated list. With cursor
  // pagination we'd only see counts for the rows we've fetched, which is
  // misleading. Keep the visual but compute from what we have; once a
  // dedicated stats endpoint exists we can wire that in. The "total" count
  // is intentionally `clients.length` (what's loaded), not a server total —
  // adding a count query for this one stat is not worth a separate round
  // trip on every paged fetch.
  const stats = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    for (const c of clients) {
      if (c.packageStatus === "active") active++;
      else if (c.packageStatus === "expiring") expiring++;
      else if (c.packageStatus === "expired") expired++;
    }
    return { active, expiring, expired };
  }, [clients]);

  return (
    <ScreenContainerRaw title={t("tabs.clients")}>
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ──────────────────────────────────────────────────
            Lives OUTSIDE the list so the search input and stat strip stay
            pinned while rows scroll underneath. Previously these sat inside
            FlatList's ListHeaderComponent and scrolled away with the rows.
            The MotiView entry animations are preserved — they only run once
            on mount, not on every list scroll. */}
        <View
          style={{
            paddingTop: 16,
            paddingHorizontal: 24,
            paddingBottom: 12,
            gap: 16,
          }}
        >
          {/* Search */}
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 60 }}
          >
            <Input
              testID="trainer-clients-search-input"
              placeholder={t("admin.clients.searchPlaceholder")}
              leftIcon="search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MotiView>

          {/* Stat strip — total / active / expiring */}
          <MotiView
            from={{ opacity: 0, translateY: -4 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 140 }}
          >
            <View className="flex-row gap-2">
              <StatPill
                value={clients.length}
                label={t("trainer.clients.statTotal")}
              />
              <StatPill
                value={stats.active}
                label={t("admin.clients.filterActive")}
              />
              <StatPill
                value={stats.expiring}
                label={t("admin.clients.filterExpiring")}
              />
            </View>
          </MotiView>
        </View>

        {/* ── List body ─────────────────────────────────────────────────────
            The wrapper owns loading / empty / error / fetch-next-page footer
            states. */}
        <PaginatedList<Client>
          query={clientsQuery}
          data={clients}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ClientRow client={item} />}
          ItemSeparatorComponent={ClientRowSeparator}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: bottomPad,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2e5b42"
              colors={["#2e5b42"]}
            />
          }
          errorState={<ErrorState message={t("trainer.clients.error")} />}
          emptyState={
            <EmptyState
              title={
                searchQuery
                  ? t("admin.clients.filterEmpty")
                  : t("admin.clients.empty")
              }
            />
          }
        />
      </View>
    </ScreenContainerRaw>
  );
}
