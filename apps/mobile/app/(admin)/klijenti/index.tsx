// P2-T9: Admin clients — Linear-style searchable list with filter chips, GlassCard rows,
// segmented Clients/Invites tabs.
//
// Flow extraction: the six per-client flows (invite, create, edit, assign
// comp/paid, pause, actions+delete) each live in their own module under
// components/admin/client-flows/. Every module owns its form state,
// validation, and mutations; this screen keeps only the tab/search/filter
// state, the list rendering, pull-to-refresh, and ONE state variable per
// flow. Cross-flow choreography (which sheet opens after which) is wired
// HERE through the modules' callbacks.
//
// Migration note: the clients list is rendered through `<PaginatedList>` and the
// search input + filter chips live in a fixed View ABOVE the list so they no
// longer drift off-screen as the user scrolls. The hand-rolled
// `ScrollView + onScroll → fetchNextPage` plumbing and the ActivityIndicator
// footer are gone — the wrapper owns both.

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { MotiView } from "@/components/ui/styled";
import { Icon } from "@/components/ui/icon";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/tabs";
import { useThemeTokens } from "@/components/ui/tokens";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";
import type { AssignPackageMode } from "@/components/admin/assign-package-sheet-content";
import { InitialsAvatar } from "@/components/admin/client-flows/initials-avatar";
import { InviteSheet } from "@/components/admin/client-flows/invite-sheet";
import { EditClientSheet } from "@/components/admin/client-flows/edit-client-sheet";
import { ClientActionsSheet } from "@/components/admin/client-flows/client-actions-sheet";
import { AssignPackageSheet } from "@/components/admin/client-flows/assign-package-sheet";
import { PauseSheet } from "@/components/admin/client-flows/pause-sheet";
import { FilterChip } from "@/components/ui/studio";
import { PaginatedList } from "@/components/ui/paginated-list";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import {
  invitesQueries,
  revokeInviteMutationOptions,
  resendInviteMutationOptions,
  type Invite,
} from "@/lib/queries/invites-queries-factory";
import type { ClientsResponse } from "@baza/types/clients";

type ClientListItem = ClientsResponse["clients"][number];

// ─── FilterType ───────────────────────────────────────────────────────────────

type FilterType = "all" | "active" | "expiring" | "paused" | "expired";

// ─── AssignFor ────────────────────────────────────────────────────────────────
// The one state variable of the assign-package flow: which client, comp or
// paid, and the optional deep-link PackageType pre-selection.

type AssignFor = {
  clientId: string;
  mode: AssignPackageMode;
  initialPackageTypeId: string | null;
};

// ─── ClientRow / Separator ────────────────────────────────────────────────────
// Extracted from the inline map so the new <PaginatedList> can hand each item
// to renderItem. Behavior identical to the old row: tapping the card pushes
// the detail page, tapping the pencil opens the actions sheet. The pencil is
// a nested Pressable — RN consumes the inner press first so the outer push()
// never fires from the same tap.

function ClientRow({
  client,
  tokens,
  t,
  onPress,
  onPressActions,
}: {
  client: ClientListItem;
  tokens: ReturnType<typeof useThemeTokens>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onPress: () => void;
  onPressActions: () => void;
}) {
  return (
    <Pressable
      testID={`client-row-${client.id}`}
      onPress={onPress}
      android_ripple={null}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <InitialsAvatar name={client.user.fullName} />
      <View className="flex-1 gap-0.5">
        <Text
          className="text-foreground font-body-semibold"
          style={{ fontSize: 15 }}
          numberOfLines={1}
        >
          {client.user.fullName}
        </Text>
        <Text className="text-muted" style={{ fontSize: 12 }} numberOfLines={1}>
          {client.user.email}
        </Text>
      </View>
      {client.packageStatus === "active" ? (
        <Badge status="success">{t("admin.clientDetail.status.active")}</Badge>
      ) : client.packageStatus === "expiring" ? (
        <Badge status="warning">{t("admin.clientDetail.status.expiring")}</Badge>
      ) : client.packageStatus === "paused" ? (
        <Badge status="neutral">{t("admin.clientDetail.status.paused")}</Badge>
      ) : client.packageStatus === "expired" ? (
        <Badge status="danger">{t("admin.clientDetail.status.expired")}</Badge>
      ) : null}
      <Pressable
        testID={`client-pencil-${client.user.id}`}
        onPress={onPressActions}
        hitSlop={12}
        android_ripple={null}
        accessibilityRole="button"
        accessibilityLabel={t("admin.clients.openActions")}
        className="w-8 h-8 items-center justify-center -mr-1 active:opacity-60"
      >
        <Icon name="edit-2" size={16} color={tokens.faint} />
      </Pressable>
    </Pressable>
  );
}

function ClientRowSeparator() {
  // Hairline divider that lines up with the row content (starts after the
  // 40px avatar + 12px gap = 52px).
  return (
    <View className="bg-glass-border" style={{ height: 1, marginLeft: 52 }} />
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AdminClients() {
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();

  // Deep-link entry from a BIRTHDAY_ADMIN_PROMPT (or any future caller) —
  // open the AssignPackage sheet for the targeted client, with optional
  // pre-selection of a PackageType. The screen is a tab and stays mounted
  // across navigations, so a second notification tap re-feeds new params
  // here — see the effect below that translates params → sheet state and
  // then clears them, so back-navigation doesn't re-open the sheet.
  const linkParams = useLocalSearchParams<{
    openAssignPackage?: string;
    mode?: string;
    initialPackageTypeId?: string;
  }>();

  // ── Tab + search + filter state ──────────────────────────────────────────
  const [tab, setTab] = useState<"clients" | "invites">("clients");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  // ── Flow state — ONE variable per flow, everything else lives inside the
  //    client-flows modules ──────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  // Edit takes a SNAPSHOT of the row (the old code copied the row's fields
  // into the form at "Izmeni" press time — passing the entity preserves that).
  const [editClient, setEditClient] = useState<ClientListItem | null>(null);
  const [assignFor, setAssignFor] = useState<AssignFor | null>(null);
  const [pauseClientId, setPauseClientId] = useState<string | null>(null);
  // Actions sheet — opened by tapping a client row in the list. Id only;
  // the row is live-derived from the loaded pages below.
  const [actionsClientId, setActionsClientId] = useState<string | null>(null);
  // Revoke confirmation belongs to the invites LIST the screen renders
  // (triggered from an invite row, not from any client flow), so it stays here.
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Translate deep-link params → sheet state, then clear params. Runs on
  // every change in linkParams, not just mount, so a *second* notification
  // tap (screen already mounted) still opens the sheet. Clearing params
  // immediately means back-navigation doesn't reopen the sheet on its own.
  useEffect(() => {
    if (
      !linkParams.openAssignPackage &&
      !linkParams.initialPackageTypeId &&
      !linkParams.mode
    ) {
      return;
    }
    if (linkParams.openAssignPackage) {
      setAssignFor({
        clientId: linkParams.openAssignPackage,
        mode: linkParams.mode === "paid" ? "paid" : "comp",
        initialPackageTypeId: linkParams.initialPackageTypeId ?? null,
      });
    }
    router.setParams({
      openAssignPackage: undefined,
      mode: undefined,
      initialPackageTypeId: undefined,
    });
  }, [
    linkParams.openAssignPackage,
    linkParams.mode,
    linkParams.initialPackageTypeId,
  ]);

  // ── Queries ───────────────────────────────────────────────────────────────
  // Server-side search via useDeferredValue: the filter runs in Postgres
  // rather than over a 1000-row in-memory array, and the deferred value
  // batches keystrokes so we don't hammer the API on every character.
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const clientsQuery = useInfiniteQuery(
    clientsQueries.list({ q: deferredSearch || undefined }),
  );
  const invitesQuery = useQuery(invitesQueries.list());

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Only the invites-LIST row actions remain on the screen — every flow
  // mutation moved into its module. revoke/resend splice their returned row
  // into the invites list cache (baked into the options-builders); revoke's
  // component-only side-effect (clear the confirm) is passed per-call.
  const revokeMutation = useMutation(revokeInviteMutationOptions(queryClient));
  const resendMutation = useMutation(resendInviteMutationOptions(queryClient));

  // ── Raw data ──────────────────────────────────────────────────────────────
  const clients = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );
  const invites = invitesQuery.data?.invites ?? [];

  // ── Flow targets derived from the loaded pages ────────────────────────────
  // Same live `clients.find` the old inline sheets did in their render-props.
  const actionsClient = actionsClientId
    ? (clients.find((c) => c.id === actionsClientId) ?? null)
    : null;
  const assignClient = assignFor
    ? (clients.find((c) => c.id === assignFor.clientId) ?? null)
    : null;

  // ── Status filter (q is already server-side) ──────────────────────────────
  // The package-status chip still narrows client-side — applying it as
  // another server filter would require extending the API and most users
  // toggle it across the current view, not "show me ALL paused" globally.
  // When this matters we can lift it to the server.
  const filteredClients =
    filter === "all"
      ? clients
      : clients.filter((c) => c.packageStatus === filter);

  // ── Refresh ───────────────────────────────────────────────────────────────
  // Behavior preserved verbatim: pull-to-refresh invalidates both clients
  // and invites caches. Now mounted on the list (via <PaginatedList>'s new
  // refreshControl prop) rather than the outer container — the sticky
  // header is not pull-able by design.
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clientsQueries.all }),
      queryClient.invalidateQueries({ queryKey: invitesQueries.all }),
    ]);
    setRefreshing(false);
  }

  const inviteStatusKeys: Record<string, string> = {
    PENDING: "admin.clients.inviteStatusPending",
    COMPLETED: "admin.clients.inviteStatusCompleted",
    REVOKED: "admin.clients.inviteStatusRevoked",
    EXPIRED: "admin.clients.inviteStatusExpired",
  };

  const FILTERS: { key: FilterType; labelKey: string }[] = [
    { key: "all", labelKey: "admin.clients.filterAll" },
    { key: "active", labelKey: "admin.clients.filterActive" },
    { key: "expiring", labelKey: "admin.clients.filterExpiring" },
    { key: "paused", labelKey: "admin.clients.filterPaused" },
    { key: "expired", labelKey: "admin.clients.filterExpired" },
  ];

  return (
    <ScreenContainerRaw
      title={t("tabs.clients")}
      leftSlot={<AdminTabLeftSlot />}
      rightSlot={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <HeaderIconButton
            icon="sticky-note-o"
            onPress={() => router.push("/(admin)/klijenti/beleske")}
            testID="admin-notes-button"
            accessibilityLabel={t("admin.notes.title")}
          />
          <HeaderIconButton
            icon="plus"
            onPress={() => setInviteOpen(true)}
            testID="admin-new-client-button"
            accessibilityLabel={t("admin.clients.sheetInvite")}
          />
        </View>
      }
    >
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ───────────────────────────────────────────────
            Lives OUTSIDE the list so the search input, segmented control,
            and filter chips stay pinned while rows scroll underneath. The
            entry animations on each block are preserved — they only run
            once on mount, not on every list scroll. */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 8,
            gap: 10,
          }}
        >
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 80 }}
          >
            <Input
              testID="klijenti-search-input"
              placeholder={t("admin.clients.searchPlaceholder")}
              leftIcon="search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 160 }}
          >
            <SegmentedControl
              segments={[
                {
                  value: "clients" as const,
                  label: t("admin.clients.tabClients", { count: clients.length }),
                  testID: "admin-clients-tab-clients",
                },
                {
                  value: "invites" as const,
                  label: t("admin.clients.tabInvites", { count: invites.length }),
                  testID: "admin-clients-tab-invites",
                },
              ]}
              value={tab}
              onValueChange={setTab}
            />
          </MotiView>

          {tab === "clients" ? (
            <MotiView
              from={{ opacity: 0, translateY: -4 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 300, delay: 200 }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {FILTERS.map(({ key, labelKey }) => (
                  <FilterChip
                    key={key}
                    active={filter === key}
                    label={t(labelKey)}
                    onPress={() => setFilter(key)}
                  />
                ))}
              </ScrollView>
            </MotiView>
          ) : null}
        </View>

        {/* ── List body ─────────────────────────────────────────────────────
            Filter chips narrow client-side over already-loaded pages —
            same trade-off as ActiveAssignments. Lifting `filter` to the
            API would require extending the endpoint; most admins toggle
            chips across the current view rather than asking for "ALL
            paused" globally. */}
        {tab === "clients" ? (
          <PaginatedList<ClientListItem>
            query={clientsQuery}
            data={filteredClients}
            keyExtractor={(client) => client.id}
            renderItem={({ item }) => (
              <ClientRow
                client={item}
                tokens={tokens}
                t={t}
                onPress={() =>
                  router.push(`/(admin)/klijenti/${item.user.id}`)
                }
                onPressActions={() => setActionsClientId(item.id)}
              />
            )}
            ItemSeparatorComponent={ClientRowSeparator}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: bottomPad,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={tokens.accent}
                colors={[tokens.accent]}
              />
            }
            errorState={<ErrorState message={t("admin.clients.error")} />}
            emptyState={
              <EmptyState
                title={
                  filter !== "all"
                    ? t("admin.clients.filterEmpty")
                    : deferredSearch
                      ? t("admin.clients.filterEmpty")
                      : t("admin.clients.empty")
                }
              />
            }
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: bottomPad,
              gap: 10,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={tokens.accent}
                colors={[tokens.accent]}
              />
            }
          >
            {invitesQuery.isError ? (
              <ErrorState message={t("admin.clients.invitesError")} />
            ) : null}
            {invites.length === 0 ? (
              <EmptyState title={t("admin.clients.invitesEmpty")} />
            ) : null}

            {invites.map((invite: Invite) => (
              <GlassCard key={invite.id} testID={`invite-row-${invite.id}`}>
                <View className="flex-col gap-2.5">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 flex-col">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 15 }}
                      >
                        {invite.fullName}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 13 }}>
                        {invite.email}
                      </Text>
                    </View>
                    <Badge
                      status={
                        invite.status === "COMPLETED"
                          ? "success"
                          : invite.status === "PENDING"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {inviteStatusKeys[invite.status]
                        ? t(inviteStatusKeys[invite.status])
                        : invite.status}
                    </Badge>
                  </View>
                  {invite.status === "PENDING" ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => resendMutation.mutate(invite.id)}
                        disabled={resendMutation.isPending}
                        className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-glass-border bg-glass active:opacity-70"
                      >
                        <Icon name="refresh" size={12} color={tokens.muted} />
                        <Text className="text-foreground" style={{ fontSize: 12, fontWeight: "600" }}>
                          {t("admin.clients.resend")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmRevokeId(invite.id)}
                        disabled={revokeMutation.isPending}
                        className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-danger-soft bg-danger-soft active:opacity-70"
                      >
                        <Icon name="ban" size={12} color={tokens.danger} />
                        <Text className="text-danger" style={{ fontSize: 12, fontWeight: "600" }}>
                          {t("admin.clients.revoke")}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </GlassCard>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════════════
          THE SIX CLIENT FLOWS — one module each, one state variable each.
          The onBack/onEditClient/... wiring below is the ONLY place that
          decides which sheet opens after which.
      ═══════════════════════════════════════════════════════════════════ */}


      <EditClientSheet
        client={editClient}
        onClose={() => setEditClient(null)}
        onBack={() => {
          const client = editClient;
          setEditClient(null);
          if (client) setActionsClientId(client.id);
        }}
      />

      <ClientActionsSheet
        open={!!actionsClientId}
        client={actionsClient}
        onClose={() => setActionsClientId(null)}
        onEditClient={(id) =>
          setEditClient(clients.find((c) => c.id === id) ?? null)
        }
        onNewPayment={(id) =>
          setAssignFor({ clientId: id, mode: "paid", initialPackageTypeId: null })
        }
        onAssignPackage={(id) =>
          setAssignFor({ clientId: id, mode: "comp", initialPackageTypeId: null })
        }
        onPause={(id) => setPauseClientId(id)}
      />

      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => setTab("invites")}
      />

      <AssignPackageSheet
        client={assignClient}
        mode={assignFor?.mode ?? "comp"}
        initialPackageTypeId={assignFor?.initialPackageTypeId ?? undefined}
        onClose={() => setAssignFor(null)}
        onBack={() => {
          const id = assignFor?.clientId ?? null;
          setAssignFor(null);
          if (id) setActionsClientId(id);
        }}
      />

      <PauseSheet
        clientProfileId={pauseClientId}
        onClose={() => setPauseClientId(null)}
        onBack={() => {
          const id = pauseClientId;
          setPauseClientId(null);
          if (id) setActionsClientId(id);
        }}
      />

      <ConfirmSheet
        open={!!confirmRevokeId}
        onOpenChange={(o) => !o && setConfirmRevokeId(null)}
        title={t("confirm.revokeInviteTitle")}
        message={t("confirm.revokeInviteMessage")}
        confirmLabel={t("confirm.revokeInviteConfirm")}
        loading={revokeMutation.isPending}
        errorMessage={
          revokeMutation.isError
            ? (revokeMutation.error as Error)?.message ?? null
            : null
        }
        onConfirm={() => {
          if (!confirmRevokeId) return;
          revokeMutation.mutate(confirmRevokeId, {
            onSuccess: () => setConfirmRevokeId(null),
          });
        }}
      />
    </ScreenContainerRaw>
  );
}
