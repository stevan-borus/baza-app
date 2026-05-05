// P2-T9: Admin clients — Linear-style searchable list with filter chips, GlassCard rows,
// segmented Clients/Invites tabs. All five AppSheets (create, edit, invite, assign-package,
// pause) are preserved verbatim with their form state and mutations unchanged.

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { AppSheet } from "@/components/ui/sheet";
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
import { FilterChip } from "@/components/ui/studio";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { invitesQueries, type Invite } from "@/lib/queries/invites-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

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
  const [showPause, setShowPause] = useState<string | null>(null);
  // Actions sheet — opened by tapping a client row in the list.
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);
  // Delete confirmation — separate from the actions sheet so a stray tap
  // can't soft-delete a client.
  const [showDeleteFor, setShowDeleteFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", phone: "" });
  const [clientForm, setClientForm] = useState({ email: "", fullName: "", phone: "" });
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true });
  const [assignForm, setAssignForm] = useState({ packageTypeId: "", startsAt: "" });
  const [pauseForm, setPauseForm] = useState({ startsAt: "", endsAt: "", reason: "" });

  // ── Queries ───────────────────────────────────────────────────────────────
  const clientsQuery = useQuery(clientsQueries.list());
  const invitesQuery = useQuery(invitesQueries.list());
  const packageTypesQuery = useQuery(packagesQueries.types());

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createInviteMutation = useMutation({
    ...invitesQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      setShowInviteForm(false);
      setInviteForm({ email: "", fullName: "", phone: "" });
    },
  });
  const revokeMutation = useMutation({
    ...invitesQueries.revoke(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
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
  const assignPackageMutation = useMutation({
    ...packagesQueries.createClientPackage(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      setShowAssignPackage(null);
      setAssignForm({ packageTypeId: "", startsAt: "" });
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
  const clients = clientsQuery.data?.clients ?? [];
  const invites = invitesQuery.data?.invites ?? [];

  // ── Filtered client list ──────────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const searchedClients = q
    ? clients.filter(
        (c) =>
          c.user.fullName.toLowerCase().includes(q) ||
          c.user.email.toLowerCase().includes(q),
      )
    : clients;

  const filteredClients =
    filter === "all"
      ? searchedClients
      : searchedClients.filter((c) => c.packageStatus === filter);

  // ── Refresh ───────────────────────────────────────────────────────────────
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
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() =>
            tab === "clients"
              ? setShowCreateClient(true)
              : setShowInviteForm(true)
          }
          accessibilityLabel={
            tab === "clients"
              ? t("admin.clients.sheetNewClient")
              : t("admin.clients.sheetInvite")
          }
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
      >
      <View
        className="px-5 flex-col gap-4 flex-1"
        style={{ paddingTop: 16, paddingBottom: bottomPad }}
      >
        {/* ── Search input ────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 80 }}
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

        {/* ── Segmented control ───────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 160 }}
        >
          <SegmentedControl
            segments={[
              { value: "clients" as const, label: t("admin.clients.tabClients", { count: clients.length }) },
              { value: "invites" as const, label: t("admin.clients.tabInvites", { count: invites.length }) },
            ]}
            value={tab}
            onValueChange={setTab}
          />
        </MotiView>

        {/* ── Filter chips (clients tab only) ─────────────────────────────── */}
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

        {/* ── List content ────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 240 }}
          style={{ gap: 10 }}
        >
          {tab === "clients" ? (
            <>
              {clientsQuery.isError ? <ErrorState message={t("admin.clients.error")} /> : null}
              {!clientsQuery.isError && filteredClients.length === 0 && filter !== "all" ? (
                <EmptyState title={t("admin.clients.filterEmpty")} />
              ) : !clientsQuery.isError && searchedClients.length === 0 ? (
                <EmptyState title={t("admin.clients.empty")} />
              ) : null}

              {/* Compact rows. Tap a row → opens the actions sheet (Uredi /
                  Dodeli paket / Pauziraj / Obriši). Status badge sits to
                  the right of the email so density stays low even with
                  hundreds of clients on screen. */}
              <View className="bg-surface rounded-lg overflow-hidden">
                {filteredClients.map((client, idx) => (
                  <React.Fragment key={client.id}>
                    {idx > 0 ? (
                      <View
                        className="bg-glass-border"
                        style={{ height: 1, marginLeft: 64 }}
                      />
                    ) : null}
                    <Pressable
                      onPress={() => setShowActionsFor(client.id)}
                      android_ripple={null}
                      className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
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
                        <Text
                          className="text-muted"
                          style={{ fontSize: 12 }}
                          numberOfLines={1}
                        >
                          {client.user.email}
                          {client.user.phone ? ` · ${client.user.phone}` : ""}
                        </Text>
                      </View>
                      {client.packageStatus === "active" ? (
                        <Badge status="success">
                          {t("admin.clients.filterActive")}
                        </Badge>
                      ) : client.packageStatus === "expiring" ? (
                        <Badge status="warning">
                          {t("admin.clients.filterExpiring")}
                        </Badge>
                      ) : client.packageStatus === "paused" ? (
                        <Badge status="neutral">
                          {t("admin.clients.filterPaused")}
                        </Badge>
                      ) : client.packageStatus === "expired" ? (
                        <Badge status="danger">
                          {t("admin.clients.filterExpired")}
                        </Badge>
                      ) : null}
                      <FontAwesome
                        name="chevron-right"
                        size={11}
                        color={tokens.faint}
                      />
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>
            </>
          ) : (
            <>
              {invitesQuery.isError ? <ErrorState message={t("admin.clients.invitesError")} /> : null}
              {invites.length === 0 ? <EmptyState title={t("admin.clients.invitesEmpty")} /> : null}

              {invites.map((invite: Invite) => (
                <GlassCard key={invite.id}>
                  <View className="flex-col gap-2.5">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 flex-col">
                        <Text className="text-foreground font-body-semibold" style={{ fontSize: 15 }}>
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
                          onPress={() => revokeMutation.mutate(invite.id)}
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
            </>
          )}
        </MotiView>

        {/* ═══════════════════════════════════════════════════════════════════
            ALL FIVE APPSHEETS — preserved verbatim
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
                  icon="gift"
                  label={t("admin.clients.assignPackage")}
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowAssignPackage(client.id);
                  }}
                />
                <ActionRow
                  icon="pause"
                  label={t("admin.clients.pause")}
                  onPress={() => {
                    setShowActionsFor(null);
                    setShowPause(client.id);
                  }}
                />
                <ActionRow
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
                  <Pressable
                    onPress={() => setShowDeleteFor(null)}
                    android_ripple={null}
                    className="flex-1 items-center justify-center py-3.5 rounded border border-glass-border active:opacity-70"
                  >
                    <Text
                      className="font-body-semibold uppercase text-foreground"
                      style={{ fontSize: 12, letterSpacing: 1.4 }}
                    >
                      {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      updateClientMutation.mutate({
                        id: client.id,
                        isActive: false,
                      });
                      setShowDeleteFor(null);
                    }}
                    android_ripple={null}
                    className="flex-1 items-center justify-center py-3.5 rounded bg-danger active:opacity-90"
                  >
                    <Text
                      className="font-body-semibold uppercase text-white"
                      style={{ fontSize: 12, letterSpacing: 1.4 }}
                    >
                      {t("admin.clients.delete")}
                    </Text>
                  </Pressable>
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
              placeholder={t("admin.clients.placeholderEmail")}
              autoCapitalize="none"
              keyboardType="email-address"
              value={inviteForm.email}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, email: v }))}
            />
            <Input
              placeholder={t("admin.clients.placeholderFullName")}
              value={inviteForm.fullName}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, fullName: v }))}
            />
            <Input
              placeholder={t("admin.clients.placeholderPhone")}
              keyboardType="phone-pad"
              value={inviteForm.phone}
              onChangeText={(v) => setInviteForm((s) => ({ ...s, phone: v }))}
            />
            <Button
              disabled={createInviteMutation.isPending || !inviteForm.email || !inviteForm.fullName}
              onPress={() =>
                createInviteMutation.mutate({
                  email: inviteForm.email,
                  fullName: inviteForm.fullName,
                  phone: inviteForm.phone || undefined,
                })
              }
            >
              {t("admin.clients.sendInvite")}
            </Button>
            {createInviteMutation.isError ? <ErrorState message={t("admin.clients.inviteError")} /> : null}
          </View>
        </AppSheet>

        {/* Assign Package Sheet */}
        <AppSheet open={!!showAssignPackage} onOpenChange={() => setShowAssignPackage(null)}>
          <View className="flex-col gap-4">
            <SheetHeader
              title={t("admin.clients.sheetAssign")}
              onBack={() => {
                const id = showAssignPackage;
                setShowAssignPackage(null);
                if (id) setShowActionsFor(id);
              }}
            />
            <SectionLabel>{t("admin.clients.packageType")}</SectionLabel>
            {(packageTypesQuery.data?.packageTypes ?? []).map((pt) => (
              <Button
                key={pt.id}
                size="small"
                variant={assignForm.packageTypeId === pt.id ? "primary" : "secondary"}
                onPress={() => setAssignForm((s) => ({ ...s, packageTypeId: pt.id }))}
              >
                {t("admin.clients.sessionsCount", { name: pt.name, count: pt.sessionCount })}
              </Button>
            ))}
            <Input
              placeholder={t("admin.clients.placeholderStart")}
              value={assignForm.startsAt}
              onChangeText={(v) => setAssignForm((s) => ({ ...s, startsAt: v }))}
            />
            <Button
              disabled={assignPackageMutation.isPending || !assignForm.packageTypeId || !assignForm.startsAt}
              onPress={() =>
                showAssignPackage &&
                assignPackageMutation.mutate({
                  clientProfileId: showAssignPackage,
                  packageTypeId: assignForm.packageTypeId,
                  startsAt: assignForm.startsAt,
                })
              }
            >
              {t("admin.clients.assign")}
            </Button>
            {assignPackageMutation.isError ? <ErrorState message={t("admin.clients.assignError")} /> : null}
          </View>
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
              placeholder={t("admin.clients.pauseStart")}
              value={pauseForm.startsAt}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, startsAt: v }))}
            />
            <Input
              placeholder={t("admin.clients.pauseEnd")}
              value={pauseForm.endsAt}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, endsAt: v }))}
            />
            <Input
              placeholder={t("admin.clients.pauseReason")}
              value={pauseForm.reason}
              onChangeText={(v) => setPauseForm((s) => ({ ...s, reason: v }))}
            />
            <Button
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
      </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}

// ─── ActionRow ───────────────────────────────────────────────────────────────
// Used inside the client-actions sheet. Feather icon + label + chevron, full
// width, hairline-divided. Destructive variant tints icon + label red.

import Feather from "@expo/vector-icons/Feather";

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
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const t = useThemeTokens();
  return (
    <Pressable
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
