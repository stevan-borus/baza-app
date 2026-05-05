/**
 * Trainer Clients screen — searchable roster with compact stat strip.
 *
 * Layout: header → search input → "active · this month · expiring" stat strip
 * → glass-card list, one row per client, tappable to expand notes.
 * The empty hero card from the previous design is gone — it conveyed nothing
 * useful. The stat strip now sits inline with the search and shows real
 * counts derived from packageStatus.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  RefreshControl,
  ScrollView,
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
  user: { fullName: string; email: string };
};

const STATUS_BADGE: Record<
  Client["packageStatus"],
  { tone: "success" | "warning" | "neutral"; key: string }
> = {
  active: { tone: "success", key: "admin.clients.filterActive" },
  expiring: { tone: "warning", key: "admin.clients.filterExpiring" },
  expired: { tone: "warning", key: "admin.clients.filterExpired" },
  paused: { tone: "neutral", key: "admin.clients.filterPaused" },
  none: { tone: "neutral", key: "admin.clients.filterAll" },
};

function ClientRow({ client }: { client: Client }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const initials = getInitials(client.user.fullName);
  const badge = STATUS_BADGE[client.packageStatus];

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      className="active:opacity-80"
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

        {expanded && client.notes ? (
          <View
            className="mt-3 pt-3"
            style={{
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text className="text-xs text-muted leading-5">{client.notes}</Text>
          </View>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TrainerClients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding(24);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const clientsQuery = useQuery(clientsQueries.list());

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    setRefreshing(false);
  }

  const clients = clientsQuery.data?.clients ?? [];

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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.user.fullName.toLowerCase().includes(q) ||
        c.user.email.toLowerCase().includes(q),
    );
  }, [clients, searchQuery]);

  return (
    <ScreenContainerRaw title={t("tabs.clients")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2e5b42"
            colors={["#2e5b42"]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: bottomPad,
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

        {/* Error / empty / list */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 220 }}
          style={{ gap: 10 }}
        >
          {clientsQuery.isError ? (
            <ErrorState message={t("trainer.clients.error")} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                searchQuery
                  ? t("admin.clients.filterEmpty")
                  : t("admin.clients.empty")
              }
            />
          ) : (
            filtered.map((client) => (
              <ClientRow key={client.id} client={client} />
            ))
          )}
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
