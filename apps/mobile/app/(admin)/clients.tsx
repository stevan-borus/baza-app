// P2-T9: Admin clients — Linear-style searchable list with filter chips, GlassCard rows,
// segmented Clients/Invites tabs. All five AppSheets (create, edit, invite, assign-package,
// pause) are preserved verbatim with their form state and mutations unchanged.

import { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/tabs";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";
import { ACCENT } from "@/components/ui/tokens";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { invitesQueries, type Invite } from "@/lib/queries/invites-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        active ? "bg-accent border-accent" : "bg-glass border-glass-border"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${active ? "text-white" : "text-muted"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── InitialsAvatar ───────────────────────────────────────────────────────────

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      className="items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(46,91,66,0.35)",
      }}
    >
      <Text className="text-accent font-bold" style={{ fontSize: 14 }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── FilterType ───────────────────────────────────────────────────────────────

type FilterType = "all" | "active" | "expiring" | "paused" | "expired";

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AdminClients() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

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
    >
      <View
        className="px-5 flex-col gap-4"
        style={{ paddingTop: insets.top + HEADER_HEIGHT + 12, paddingBottom: TAB_BAR_HEIGHT + 16 }}
      >
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, delay: 0 }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text className="text-foreground font-bold" style={{ fontSize: 26, letterSpacing: -0.5 }}>
            {t("admin.clients.title")}
          </Text>
          <Pressable
            onPress={() => setShowCreateClient(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: ACCENT,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FontAwesome name="plus" size={14} color="#fff" />
          </Pressable>
        </MotiView>

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

              {filteredClients.map((client) => (
                <GlassCard key={client.id}>
                  <View className="flex-row gap-3 items-center">
                    <InitialsAvatar name={client.user.fullName} />
                    <View className="flex-1 flex-col gap-0.5">
                      <Text
                        className="text-foreground font-semibold"
                        style={{ fontSize: 15 }}
                        numberOfLines={1}
                      >
                        {client.user.fullName}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 13 }} numberOfLines={1}>
                        {client.user.email}
                        {client.user.phone ? ` · ${client.user.phone}` : ""}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
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
                      <Pressable
                        onPress={() => {
                          setEditForm({
                            fullName: client.user.fullName,
                            phone: client.user.phone ?? "",
                            notes: client.notes ?? "",
                            isActive: true,
                          });
                          setShowEditClient(client.id);
                        }}
                        hitSlop={8}
                      >
                        <FontAwesome name="chevron-right" size={12} color="#a1a1aa" />
                      </Pressable>
                    </View>
                  </View>

                  {/* Action row */}
                  <View className="flex-row gap-2 mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
                    <Pressable
                      onPress={() => {
                        setEditForm({
                          fullName: client.user.fullName,
                          phone: client.user.phone ?? "",
                          notes: client.notes ?? "",
                          isActive: true,
                        });
                        setShowEditClient(client.id);
                      }}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <FontAwesome name="pencil" size={12} color="#a1a1aa" />
                      <Text className="text-muted" style={{ fontSize: 12, fontWeight: "600" }}>
                        {t("admin.clients.edit")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowAssignPackage(client.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <FontAwesome name="gift" size={12} color="#a1a1aa" />
                      <Text className="text-muted" style={{ fontSize: 12, fontWeight: "600" }}>
                        {t("admin.clients.assignPackage")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowPause(client.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <FontAwesome name="pause" size={12} color="#a1a1aa" />
                      <Text className="text-muted" style={{ fontSize: 12, fontWeight: "600" }}>
                        {t("admin.clients.pause")}
                      </Text>
                    </Pressable>
                  </View>
                </GlassCard>
              ))}
            </>
          ) : (
            <>
              {/* Invite tab header */}
              <View className="flex-row items-center justify-between mb-1">
                <SectionLabel>{t("admin.clients.tabInvites", { count: invites.length })}</SectionLabel>
                <Button size="small" onPress={() => setShowInviteForm(true)}>
                  {t("admin.clients.newInvite")}
                </Button>
              </View>

              {invitesQuery.isError ? <ErrorState message={t("admin.clients.invitesError")} /> : null}
              {invites.length === 0 ? <EmptyState title={t("admin.clients.invitesEmpty")} /> : null}

              {invites.map((invite: Invite) => (
                <GlassCard key={invite.id}>
                  <View className="flex-col gap-2.5">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 flex-col">
                        <Text className="text-foreground font-semibold" style={{ fontSize: 15 }}>
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
            <Text className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
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
            <Text className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
              {t("admin.clients.sheetEdit")}
            </Text>
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
                trackColor={{ false: "#404040", true: ACCENT }}
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

        {/* Invite Sheet */}
        <AppSheet open={showInviteForm} onOpenChange={setShowInviteForm}>
          <View className="flex-col gap-4">
            <Text className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
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
            <Text className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
              {t("admin.clients.sheetAssign")}
            </Text>
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
            <Text className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
              {t("admin.clients.sheetPause")}
            </Text>
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
  );
}
