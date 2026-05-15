// P2-T9: Admin clients — Linear-style searchable list with filter chips, GlassCard rows,
// segmented Clients/Invites tabs. All five AppSheets (create, edit, invite, assign-package,
// pause) are preserved verbatim with their form state and mutations unchanged.
//
// Migration note: the clients list is rendered through `<PaginatedList>` and the
// search input + filter chips live in a fixed View ABOVE the list so they no
// longer drift off-screen as the user scrolls. The hand-rolled
// `ScrollView + onScroll → fetchNextPage` plumbing and the ActivityIndicator
// footer are gone — the wrapper owns both.

import React, { useDeferredValue, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { MotiView } from "@/components/ui/styled";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/tabs";
import { useThemeTokens } from "@/components/ui/tokens";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";
import { AssignPackageSheetContent } from "@/components/admin/assign-package-sheet-content";
import { FilterChip } from "@/components/ui/studio";
import { PaginatedList } from "@/components/ui/paginated-list";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toIsoDate } from "@/lib/date-of-birth";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { invitesQueries, type Invite } from "@/lib/queries/invites-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { now } from "@/lib/now";
import type { ClientsResponse } from "@baza/types";

type ClientListItem = ClientsResponse["clients"][number];

// ─── InitialsAvatar ───────────────────────────────────────────────────────────

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
      <Text className="text-accent font-body-bold" style={{ fontSize: 14 }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── FilterType ───────────────────────────────────────────────────────────────

type FilterType = "all" | "active" | "expiring" | "paused" | "expired";

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
          {client.user.phone ? ` · ${client.user.phone}` : ""}
        </Text>
      </View>
      {client.packageStatus === "active" ? (
        <Badge status="success">{t("admin.clients.filterActive")}</Badge>
      ) : client.packageStatus === "expiring" ? (
        <Badge status="warning">{t("admin.clients.filterExpiring")}</Badge>
      ) : client.packageStatus === "paused" ? (
        <Badge status="neutral">{t("admin.clients.filterPaused")}</Badge>
      ) : client.packageStatus === "expired" ? (
        <Badge status="danger">{t("admin.clients.filterExpired")}</Badge>
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
        <Feather name="edit-2" size={16} color={tokens.faint} />
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

  // ── Tab + search + filter state ──────────────────────────────────────────
  const [tab, setTab] = useState<"clients" | "invites">("clients");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  // ── Sheet open state ─────────────────────────────────────────────────────
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState<string | null>(null);
  const [showAssignPackage, setShowAssignPackage] = useState<string | null>(null);
  // P2-4: when the assign sheet opens, callers pre-arm the mode here.
  // "comp" = Dodeli paket (existing flow), "paid" = Nova uplata (P2-5 wires
  // up the actual payment fields). For now the sheet body is comp-only.
  const [showAssignPackageMode, setShowAssignPackageMode] = useState<"comp" | "paid">("comp");
  const [showPause, setShowPause] = useState<string | null>(null);
  // Actions sheet — opened by tapping a client row in the list.
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);
  // Delete confirmation — separate from the actions sheet so a stray tap
  // can't soft-delete a client.
  const [showDeleteFor, setShowDeleteFor] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [inviteForm, setInviteForm] = useState<{
    email: string;
    fullName: string;
    phone: string;
    dateOfBirth: Date | null;
  }>({ email: "", fullName: "", phone: "", dateOfBirth: null });
  const [clientForm, setClientForm] = useState({ email: "", fullName: "", phone: "" });
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true });
  const [pauseForm, setPauseForm] = useState({ startsAt: "", endsAt: "", reason: "" });

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
  const createInviteMutation = useMutation({
    ...invitesQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      setShowInviteForm(false);
      setInviteForm({ email: "", fullName: "", phone: "", dateOfBirth: null });
    },
  });
  const revokeMutation = useMutation({
    ...invitesQueries.revoke(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      setConfirmRevokeId(null);
    },
  });
  const resendMutation = useMutation({
    ...invitesQueries.resend(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
  });
  const createClientMutation = useMutation({
    ...clientsQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowCreateClient(false);
      setClientForm({ email: "", fullName: "", phone: "" });
    },
  });
  const updateClientMutation = useMutation({
    ...clientsQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowEditClient(null);
    },
  });
  const pauseMutation = useMutation({
    ...packagesQueries.pause(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      setShowPause(null);
      setPauseForm({ startsAt: "", endsAt: "", reason: "" });
    },
  });

  // ── Raw data ──────────────────────────────────────────────────────────────
  const clients = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );
  const invites = invitesQuery.data?.invites ?? [];

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
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["invites"] }),
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
        <HeaderIconButton
          icon="plus"
          onPress={() =>
            tab === "clients"
              ? setShowCreateClient(true)
              : setShowInviteForm(true)
          }
          testID={
            tab === "clients"
              ? "admin-new-client-button"
              : "admin-new-invite-button"
          }
          accessibilityLabel={
            tab === "clients"
              ? t("admin.clients.sheetNewClient")
              : t("admin.clients.sheetInvite")
          }
        />
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
                onPressActions={() => setShowActionsFor(item.id)}
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
                        className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
                        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                      >
                        <FontAwesome name="refresh" size={12} color="#a1a1aa" />
                        <Text className="text-muted" style={{ fontSize: 12, fontWeight: "600" }}>
                          {t("admin.clients.resend")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmRevokeId(invite.id)}
                        disabled={revokeMutation.isPending}
                        className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
                        style={{ backgroundColor: "rgba(255,0,0,0.08)" }}
                      >
                        <FontAwesome name="ban" size={12} color="#ef4444" />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#ef4444" }}>
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
          ALL FIVE APPSHEETS — preserved verbatim (now mounted as siblings
          of the list, not inside the old ScrollView).
      ═══════════════════════════════════════════════════════════════════ */}

        {/* Create Client Sheet */}
        <AppSheet open={showCreateClient} onOpenChange={setShowCreateClient}>
          <View className="flex-col gap-4">
            <Text className="text-foreground font-body-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
              {t("admin.clients.sheetNewClient")}
            </Text>
            <Input
              placeholder={t("admin.clients.placeholderEmail")}
              autoCapitalize="none"
              keyboardType="email-address"
              value={clientForm.email}
              onChangeText={(v) => setClientForm((s) => ({ ...s, email: v }))}
            />
            <Input
              placeholder={t("admin.clients.placeholderFullName")}
              value={clientForm.fullName}
              onChangeText={(v) => setClientForm((s) => ({ ...s, fullName: v }))}
            />
            <Input
              placeholder={t("admin.clients.placeholderPhone")}
              keyboardType="phone-pad"
              value={clientForm.phone}
              onChangeText={(v) => setClientForm((s) => ({ ...s, phone: v }))}
            />
            <Button
              disabled={createClientMutation.isPending || !clientForm.email || !clientForm.fullName}
              onPress={() =>
                createClientMutation.mutate({
                  email: clientForm.email,
                  fullName: clientForm.fullName,
                  phone: clientForm.phone || undefined,
                })
              }
            >
              {t("admin.clients.createClient")}
            </Button>
            {createClientMutation.isError ? <ErrorState message={t("admin.clients.createError")} /> : null}
          </View>
        </AppSheet>

        {/* Edit Client Sheet */}
        <AppSheet open={!!showEditClient} onOpenChange={() => setShowEditClient(null)}>
          <View className="flex-col gap-4">
            <SheetHeader
              title={t("admin.clients.sheetEdit")}
              onBack={() => {
                const id = showEditClient;
                setShowEditClient(null);
                if (id) setShowActionsFor(id);
              }}
            />
            <SectionLabel>{t("admin.clients.placeholderFullName")}</SectionLabel>
            <Input
              placeholder={t("admin.clients.placeholderFullName")}
              value={editForm.fullName}
              onChangeText={(v) => setEditForm((s) => ({ ...s, fullName: v }))}
            />
            <SectionLabel>{t("admin.clients.placeholderPhoneRequired")}</SectionLabel>
            <Input
              placeholder={t("admin.clients.placeholderPhoneRequired")}
              keyboardType="phone-pad"
              value={editForm.phone}
              onChangeText={(v) => setEditForm((s) => ({ ...s, phone: v }))}
            />
            <SectionLabel>{t("admin.clients.placeholderNotes")}</SectionLabel>
            <Input
              placeholder={t("admin.clients.placeholderNotes")}
              multiline
              value={editForm.notes}
              onChangeText={(v) => setEditForm((s) => ({ ...s, notes: v }))}
            />
            <View className="flex-row items-center gap-3 py-2">
              <Text className="text-foreground" style={{ fontSize: 15 }}>
                {t("admin.clients.active")}
              </Text>
              <Switch
                value={editForm.isActive}
                onValueChange={(v) => setEditForm((s) => ({ ...s, isActive: v }))}
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
              />
            </View>
            <Button
              disabled={updateClientMutation.isPending}
              onPress={() =>
                showEditClient &&
                updateClientMutation.mutate({
                  id: showEditClient,
                  fullName: editForm.fullName,
                  phone: editForm.phone || undefined,
                  notes: editForm.notes || undefined,
                  isActive: editForm.isActive,
                })
              }
            >
              {t("admin.clients.save")}
            </Button>
            {updateClientMutation.isError ? <ErrorState message={t("admin.clients.updateError")} /> : null}
          </View>
        </AppSheet>

        {/* Actions sheet — opens when a client row is tapped. Avoids
            stacking 3+ inline action buttons under every row. */}
        <AppSheet
          open={!!showActionsFor}
          onOpenChange={(o) => !o && setShowActionsFor(null)}
        >
          {(() => {
            const client = clients.find((c) => c.id === showActionsFor);
            if (!client) return null;
            return (
              <View className="flex-col gap-2">
                <View className="flex-row items-center gap-3 pb-3">
                  <InitialsAvatar name={client.user.fullName} />
                  <View className="flex-1 gap-0.5">
                    <Text
                      className="text-foreground font-body-semibold"
                      style={{ fontSize: 16 }}
                      numberOfLines={1}
                    >
                      {client.user.fullName}
                    </Text>
                    <Text
                      className="text-muted"
                      style={{ fontSize: 12 }}
                      numberOfLines={1}
                    >
                      {client.user.email}
                    </Text>
                  </View>
                </View>
                <View className="bg-glass-border" style={{ height: 1 }} />
                <ActionRow
                  testID="client-action-edit"
                  icon="edit-2"
                  label={t("admin.clients.edit")}
                  onPress={() => {
                    setEditForm({
                      fullName: client.user.fullName,
                      phone: client.user.phone ?? "",
                      notes: client.notes ?? "",
                      isActive: true,
                    });
                    setShowActionsFor(null);
                    setShowEditClient(client.id);
                  }}
                />
                <ActionRow
                  testID="client-action-new-payment"
                  icon="dollar-sign"
                  label={t("admin.clients.newPaymentAction")}
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowAssignPackageMode("paid");
                    setShowAssignPackage(client.id);
                  }}
                />
                <ActionRow
                  testID="client-action-assign-package"
                  icon="gift"
                  label={t("admin.clients.assignPackage")}
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowAssignPackageMode("comp");
                    setShowAssignPackage(client.id);
                  }}
                />
                <ActionRow
                  testID="client-action-pause"
                  icon="pause"
                  label={t("admin.clients.pause")}
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowPause(client.id);
                  }}
                />
                <ActionRow
                  testID="client-action-delete"
                  icon="trash-2"
                  label={t("admin.clients.delete")}
                  destructive
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowDeleteFor(client.id);
                  }}
                />
              </View>
            );
          })()}
        </AppSheet>

        {/* Delete confirmation sheet — separate from the actions sheet
            so an accidental tap on "Obriši" doesn't immediately wipe a
            client. The mutation only runs from the destructive button. */}
        <AppSheet
          open={!!showDeleteFor}
          onOpenChange={(o) => !o && setShowDeleteFor(null)}
        >
          {(() => {
            const client = clients.find((c) => c.id === showDeleteFor);
            if (!client) return null;
            return (
              <View className="flex-col gap-5">
                <View className="items-center gap-3 pt-1">
                  <View className="w-12 h-12 rounded-full bg-danger-soft items-center justify-center">
                    <Feather name="alert-triangle" size={20} color="#dc2626" />
                  </View>
                  <Text
                    className="text-foreground font-body-bold text-center"
                    style={{ fontSize: 18, letterSpacing: -0.3 }}
                  >
                    {client.user.fullName}
                  </Text>
                  <Text
                    className="text-muted text-center"
                    style={{ fontSize: 14, lineHeight: 20 }}
                  >
                    {t("admin.clients.deleteConfirm")}
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onPress={() => setShowDeleteFor(null)}
                  >
                    {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
                  </Button>
                  <Button
                    testID="client-delete-confirm-button"
                    variant="danger"
                    className="flex-1"
                    onPress={() => {
                      updateClientMutation.mutate({
                        id: client.user.id,
                        isActive: false,
                      });
                      setShowDeleteFor(null);
                    }}
                  >
                    {t("admin.clients.delete")}
                  </Button>
                </View>
              </View>
            );
          })()}
        </AppSheet>

        {/* Invite Sheet */}
        <AppSheet open={showInviteForm} onOpenChange={setShowInviteForm}>
          <View className="flex-col gap-4">
            <Text className="text-foreground font-body-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
              {t("admin.clients.sheetInvite")}
            </Text>
            <Input
              testID="invite-create-email-input"
              placeholder={t("admin.clients.placeholderEmail")}
              autoCapitalize="none"
              keyboardType="email-address"
              value={inviteForm.email}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, email: v }))}
            />
            <Input
              testID="invite-create-name-input"
              placeholder={t("admin.clients.placeholderFullName")}
              value={inviteForm.fullName}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, fullName: v }))}
            />
            <Input
              testID="invite-create-phone-input"
              placeholder={t("admin.clients.placeholderPhone")}
              keyboardType="phone-pad"
              value={inviteForm.phone}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, phone: v }))}
            />
            <DateTimePicker
              testID="invite-create-dob-input"
              mode="date"
              value={inviteForm.dateOfBirth}
              onChange={(d) => setInviteForm((s) => ({ ...s, dateOfBirth: d }))}
              placeholder={t("admin.clients.placeholderDateOfBirth")}
              maximumDate={now()}
              minimumDate={new Date(Date.UTC(1900, 0, 1))}
            />
            <Button
              testID="invite-create-submit-button"
              disabled={
                createInviteMutation.isPending ||
                !inviteForm.email ||
                !inviteForm.fullName ||
                !inviteForm.dateOfBirth
              }
              onPress={() => {
                if (!inviteForm.dateOfBirth) return;
                createInviteMutation.mutate({
                  email: inviteForm.email,
                  fullName: inviteForm.fullName,
                  phone: inviteForm.phone || undefined,
                  dateOfBirth: toIsoDate(inviteForm.dateOfBirth),
                });
              }}
            >
              {t("admin.clients.sendInvite")}
            </Button>
            {createInviteMutation.isError ? <ErrorState message={t("admin.clients.inviteError")} /> : null}
          </View>
        </AppSheet>

        <AppSheet open={!!showAssignPackage} onOpenChange={() => setShowAssignPackage(null)}>
          {(() => {
            const client = clients.find((c) => c.id === showAssignPackage);
            if (!client) return null;
            return (
              <View className="flex-col gap-4">
                <SheetHeader
                  title={
                    showAssignPackageMode === "paid"
                      ? t("admin.clients.newPaymentAction")
                      : t("admin.clients.sheetAssign")
                  }
                  onBack={() => {
                    const id = showAssignPackage;
                    setShowAssignPackage(null);
                    if (id) setShowActionsFor(id);
                  }}
                />
                <AssignPackageSheetContent
                  client={client}
                  mode={showAssignPackageMode}
                  onSuccess={() => setShowAssignPackage(null)}
                />
              </View>
            );
          })()}
        </AppSheet>

        {/* Pause Package Sheet */}
        <AppSheet open={!!showPause} onOpenChange={() => setShowPause(null)}>
          <View className="flex-col gap-4">
            <SheetHeader
              title={t("admin.clients.sheetPause")}
              onBack={() => {
                const id = showPause;
                setShowPause(null);
                if (id) setShowActionsFor(id);
              }}
            />
            <Input
              testID="pause-start-input"
              placeholder={t("admin.clients.pauseStart")}
              value={pauseForm.startsAt}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, startsAt: v }))}
            />
            <Input
              testID="pause-end-input"
              placeholder={t("admin.clients.pauseEnd")}
              value={pauseForm.endsAt}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, endsAt: v }))}
            />
            <Input
              placeholder={t("admin.clients.pauseReason")}
              value={pauseForm.reason}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, reason: v }))}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
            <Button
              testID="pause-submit-button"
              disabled={pauseMutation.isPending || !pauseForm.startsAt || !pauseForm.endsAt}
              onPress={() =>
                showPause &&
                pauseMutation.mutate({
                  clientProfileId: showPause,
                  startsAt: pauseForm.startsAt,
                  endsAt: pauseForm.endsAt,
                  reason: pauseForm.reason || undefined,
                })
              }
            >
              {t("admin.clients.pauseSubmit")}
            </Button>
            {pauseMutation.isError ? <ErrorState message={t("admin.clients.pauseError")} /> : null}
          </View>
        </AppSheet>
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
          revokeMutation.mutate(confirmRevokeId);
        }}
      />
    </ScreenContainerRaw>
  );
}

// ─── ActionRow ───────────────────────────────────────────────────────────────
// Used inside the client-actions sheet. Feather icon + label + chevron, full
// width, hairline-divided. Destructive variant tints icon + label red.

/**
 * SheetHeader — back chevron on the left of the sheet title. The chevron
 * goes "back" to the actions sheet (the previous step in the user's flow);
 * the standard sheet swipe-down still dismisses entirely.
 */
function SheetHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  const t = useThemeTokens();
  return (
    <View className="flex-row items-center gap-2 -ml-1">
      <Pressable
        onPress={onBack}
        hitSlop={12}
        android_ripple={null}
        className="active:opacity-60 w-8 h-8 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Feather name="chevron-left" size={22} color={t.foreground} />
      </Pressable>
      <Text
        className="text-foreground font-body-bold flex-1"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  const t = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={null}
      className="flex-row items-center gap-3 py-3.5 active:opacity-70"
    >
      <Feather
        name={icon}
        size={18}
        color={destructive ? "#dc2626" : t.foreground}
      />
      <Text
        className={
          destructive
            ? "text-danger font-body-medium flex-1"
            : "text-foreground font-body-medium flex-1"
        }
        style={{ fontSize: 15 }}
      >
        {label}
      </Text>
      {!destructive ? (
        <Feather name="chevron-right" size={16} color={t.faint} />
      ) : null}
    </Pressable>
  );
}
