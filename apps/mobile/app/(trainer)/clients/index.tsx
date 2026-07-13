/**
 * Trainer Clients screen — searchable roster.
 *
 * Trainers see name + email + tap-to-open. Package-economics (active/expiring
 * counts and the per-row status badge) lives on the admin screens — trainers
 * don't manage renewals.
 */

import { useMemo, useState } from "react";
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
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { PaginatedList } from "@/components/ui/paginated-list";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { useDebouncedValue } from "@/lib/use-debounced-value";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── client row ─────────────────────────────────────────────────────────────

type Client = {
  id: string;
  notes?: string | null;
  user: { id: string; fullName: string; email: string };
};

function ClientRow({ client }: { client: Client }) {
  const router = useRouter();
  const initials = getInitials(client.user.fullName);

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
  // Debounced so a keystroke burst fires ONE request after the user pauses,
  // not one per letter. The server-side q-filter does the heavy lifting;
  // useDeferredValue only defers renders, so it still hit the API per keystroke.
  const deferredQuery = useDebouncedValue(searchQuery.trim());

  const clientsQuery = useInfiniteQuery(
    clientsQueries.list({ q: deferredQuery || undefined }),
  );

  const clients = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: clientsQueries.all });
    setRefreshing(false);
  }

  return (
    <ScreenContainerRaw title={t("tabs.clients")}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: 16,
            paddingHorizontal: 24,
            paddingBottom: 12,
          }}
        >
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
