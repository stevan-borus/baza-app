// P2-2: Admin client detail page — header (avatar + pencil → action sheet),
// current package card, full package history (newest first), and the first
// page of upcoming bookings powered by bookings.byClient. "Istorija
// treninga →" deep-links into the past-bookings sub-route (P2-3). The action
// sheet rows mirror klijenti/index.tsx — "Nova uplata" + card-tap/pencil
// split land in P2-4.

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import dayjs from "dayjs";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import { BookingRow } from "@/components/admin/booking-row";
import { AssignPackageSheetContent } from "@/components/admin/assign-package-sheet-content";

// ─── InitialsAvatar ───────────────────────────────────────────────────────────
// Larger variant of the list-row avatar; same styling rules as the row but
// sized for a profile header.

function InitialsAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      className="items-center justify-center rounded-full bg-accent-soft"
      style={{ width: size, height: size }}
    >
      <Text
        className="text-accent font-body-bold"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the most-recently-started "active" package: not expired and still has
 * sessions. Server-side eligibility (pauses, class-type scope) is
 * deliberately not duplicated here — this is a profile pill, not a booking
 * gate. The list is already returned newest-first by the API.
 */
function pickActivePackage(packages: ClientPackage[]): ClientPackage | null {
  const nowMs = Date.now();
  for (const p of packages) {
    if (p.sessionsRemaining <= 0) continue;
    if (new Date(p.expiresAt).getTime() < nowMs) continue;
    return p;
  }
  return null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();

  // Sheets state — mirrors klijenti/index.tsx but scoped to this one client.
  const [showActions, setShowActions] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  // P2-4: mode is pre-armed by the action-sheet rows. "comp" = Dodeli paket,
  // "paid" = Nova uplata. The sheet body still renders the comp-only form
  // for now; P2-5 makes it mode-aware.
  const [showAssignMode, setShowAssignMode] = useState<"comp" | "paid">("comp");
  const [showPause, setShowPause] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Forms (mirror klijenti/index.tsx initial shapes).
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", notes: "", isActive: true });
  const [pauseForm, setPauseForm] = useState({ startsAt: "", endsAt: "", reason: "" });

  // ── Queries ────────────────────────────────────────────────────────────────
  const clientQuery = useQuery(clientsQueries.byId(id));
  const client = clientQuery.data?.client;

  // Use the per-client GET path so the response includes the matched
  // BillingRecord per ClientPackage (closes the P2 TODO). The admin list-all
  // path doesn't attach billingRecord.
  const packagesQuery = useQuery({
    ...packagesQueries.clientPackages(client?.id),
    enabled: !!client?.id,
  });

  const upcomingQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({ clientUserId: id, period: "upcoming", limit: 20 }),
    enabled: !!id,
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const allPackages = useMemo(
    () => packagesQuery.data?.packages ?? [],
    [packagesQuery.data?.packages],
  );
  const activePackage = useMemo(() => pickActivePackage(allPackages), [allPackages]);

  const upcomingBookings = useMemo(() => {
    const pages = upcomingQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.bookings).slice(0, 10);
  }, [upcomingQuery.data?.pages]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateClientMutation = useMutation({
    ...clientsQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowEdit(false);
    },
  });
  const pauseMutation = useMutation({
    ...packagesQueries.pause(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      setShowPause(false);
      setPauseForm({ startsAt: "", endsAt: "", reason: "" });
    },
  });

  // ── Loading / error states (single shell so we keep the back button) ──────
  const headerTitle = client?.user.fullName ?? t("admin.clientDetail.title");

  return (
    <ScreenContainerRaw
      title={headerTitle}
      headerVariant="detail"
      rightSlot={
        client ? (
          <HeaderIconButton
            testID="client-detail-edit-button"
            icon="pencil"
            onPress={() => setShowActions(true)}
            accessibilityLabel={t("admin.clientDetail.openActions")}
          />
        ) : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
        {clientQuery.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}
        {clientQuery.isError ? (
          <ErrorState message={t("admin.clientDetail.loadError")} />
        ) : null}

        {client ? (
          <>
            {/* ── Section 1: Header card (avatar + email/phone + status pill) ── */}
            <GlassCard size="md">
              <View className="flex-row items-center gap-3">
                <InitialsAvatar name={client.user.fullName} />
                <View className="flex-1 gap-0.5">
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 17, letterSpacing: -0.2 }}
                    numberOfLines={1}
                  >
                    {client.user.fullName}
                  </Text>
                  <Text
                    className="text-muted"
                    style={{ fontSize: 13 }}
                    numberOfLines={1}
                  >
                    {client.user.email}
                  </Text>
                  {client.user.phone ? (
                    <Text
                      className="text-muted"
                      style={{ fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {client.user.phone}
                    </Text>
                  ) : null}
                </View>
                <PackageStatusPill status={client.packageStatus} />
              </View>
            </GlassCard>

            {/* ── Section 2: Current package ───────────────────────────── */}
            <View className="gap-2">
              <SectionLabel>{t("admin.clientDetail.currentPackage")}</SectionLabel>
              {packagesQuery.isLoading ? (
                <SkeletonCard />
              ) : activePackage ? (
                <GlassCard size="md">
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1 gap-1">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 15 }}
                        numberOfLines={1}
                      >
                        {activePackage.packageType?.name ?? "—"}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 13 }}>
                        {t("admin.clientDetail.sessionsRemaining", {
                          remaining: activePackage.sessionsRemaining,
                          total: activePackage.packageType?.sessionCount ?? "—",
                        })}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 13 }}>
                        {t("admin.clientDetail.validUntil", {
                          date: dayjs(activePackage.expiresAt).locale(lang).format("D.M.YYYY."),
                        })}
                      </Text>
                    </View>
                    <Badge status="success">
                      {t("admin.clientDetail.status.active")}
                    </Badge>
                  </View>
                </GlassCard>
              ) : (
                <EmptyState title={t("admin.clientDetail.noActivePackage")} />
              )}
            </View>

            {/* ── Section 3: Package history (newest first) ───────────── */}
            <View className="gap-2">
              <SectionLabel>{t("admin.clientDetail.packageHistory")}</SectionLabel>
              {packagesQuery.isLoading ? null : allPackages.length === 0 ? (
                <EmptyState title={t("admin.clientDetail.noPackages")} />
              ) : (
                <View className="bg-surface rounded-lg overflow-hidden">
                  {allPackages.map((p, idx) => {
                    const expired = new Date(p.expiresAt).getTime() < Date.now();
                    const usedUp = p.sessionsRemaining <= 0;
                    return (
                      <React.Fragment key={p.id}>
                        {idx > 0 ? (
                          <View
                            className="bg-glass-border"
                            style={{ height: 1, marginLeft: 16 }}
                          />
                        ) : null}
                        <View
                          testID={`package-history-row-${p.id}`}
                          className="flex-col gap-1 px-4 py-3"
                        >
                          <View className="flex-row items-center justify-between gap-3">
                            <Text
                              className="text-foreground font-body-semibold flex-1"
                              style={{ fontSize: 14 }}
                              numberOfLines={1}
                            >
                              {p.packageType?.name ?? "—"}
                            </Text>
                            {expired ? (
                              <Badge status="danger">
                                {t("admin.clientDetail.status.expired")}
                              </Badge>
                            ) : usedUp ? (
                              <Badge status="neutral">
                                {t("admin.clientDetail.status.usedUp")}
                              </Badge>
                            ) : (
                              <Badge status="success">
                                {t("admin.clientDetail.status.active")}
                              </Badge>
                            )}
                          </View>
                          <Text className="text-muted" style={{ fontSize: 12 }}>
                            {`${dayjs(p.startsAt).locale(lang).format("D.M.YYYY.")} — ${dayjs(p.expiresAt).locale(lang).format("D.M.YYYY.")}`}
                          </Text>
                          <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-muted" style={{ fontSize: 12 }}>
                              {t("admin.clientDetail.sessionsRemaining", {
                                remaining: p.sessionsRemaining,
                                total: p.packageType?.sessionCount ?? "—",
                              })}
                            </Text>
                            {/* P2 follow-up: payment/comp tag derived from
                                the BillingRecord attached server-side. Null =
                                no matching CONFIRMED payment found, so the
                                package was a comp / gift. */}
                            <Text
                              testID={`package-history-row-${p.id}-billing-tag`}
                              className="text-muted font-body-medium"
                              style={{ fontSize: 12 }}
                            >
                              {p.billingRecord
                                ? t("admin.clientDetail.paid", {
                                    amount: p.billingRecord.amount,
                                  })
                                : t("admin.clientDetail.comp")}
                            </Text>
                          </View>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
              {packagesQuery.isError ? (
                <ErrorState message={t("admin.clientDetail.packagesError")} />
              ) : null}
            </View>

            {/* ── Section 4: Upcoming bookings (first page only) ────────── */}
            <View className="gap-2">
              <SectionLabel>{t("admin.clientDetail.upcomingBookings")}</SectionLabel>
              {upcomingQuery.isLoading ? (
                <SkeletonCard />
              ) : upcomingQuery.isError ? (
                <ErrorState message={t("admin.clientDetail.upcomingError")} />
              ) : upcomingBookings.length === 0 ? (
                <EmptyState title={t("admin.clientDetail.noUpcoming")} />
              ) : (
                <View className="bg-surface rounded-lg overflow-hidden">
                  {upcomingBookings.map((b, idx) => (
                    <React.Fragment key={b.id}>
                      {idx > 0 ? (
                        <View
                          className="bg-glass-border"
                          style={{ height: 1, marginLeft: 16 }}
                        />
                      ) : null}
                      <BookingRow booking={b} />
                    </React.Fragment>
                  ))}
                </View>
              )}

              <Pressable
                testID="client-detail-history-link"
                onPress={() => router.push(`/(admin)/klijenti/${id}/istorija`)}
                android_ripple={null}
                className="flex-row items-center justify-between px-4 py-3 bg-surface rounded-lg active:opacity-70"
              >
                <Text
                  className="text-foreground font-body-medium"
                  style={{ fontSize: 14 }}
                >
                  {t("admin.clientDetail.viewHistory")}
                </Text>
                <Feather name="chevron-right" size={16} color={tokens.faint} />
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════════
          Action sheet — opened by tapping the pencil button.
      ═══════════════════════════════════════════════════════════════════ */}
      <AppSheet open={showActions} onOpenChange={setShowActions}>
        {client ? (
          <View className="flex-col gap-2">
            <View className="flex-row items-center gap-3 pb-3">
              <InitialsAvatar name={client.user.fullName} size={40} />
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
                  isActive: client.user.isActive,
                });
                setShowActions(false);
                setShowEdit(true);
              }}
            />
            <ActionRow
              testID="client-action-new-payment"
              icon="dollar-sign"
              label={t("admin.clients.newPaymentAction")}
              onPress={() => {
                setShowActions(false);
                setShowAssignMode("paid");
                setShowAssign(true);
              }}
            />
            <ActionRow
              testID="client-action-assign-package"
              icon="gift"
              label={t("admin.clients.assignPackage")}
              onPress={() => {
                setShowActions(false);
                setShowAssignMode("comp");
                setShowAssign(true);
              }}
            />
            <ActionRow
              testID="client-action-pause"
              icon="pause"
              label={t("admin.clients.pause")}
              onPress={() => {
                setShowActions(false);
                setShowPause(true);
              }}
            />
            <ActionRow
              testID="client-action-delete"
              icon="trash-2"
              label={t("admin.clients.delete")}
              destructive
              onPress={() => {
                setShowActions(false);
                setShowDelete(true);
              }}
            />
          </View>
        ) : null}
      </AppSheet>

      {/* Edit sheet */}
      <AppSheet open={showEdit} onOpenChange={setShowEdit}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
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
              trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
            />
          </View>
          <Button
            disabled={updateClientMutation.isPending || !client}
            onPress={() => {
              if (!client) return;
              updateClientMutation.mutate({
                id: client.user.id,
                fullName: editForm.fullName,
                phone: editForm.phone || undefined,
                notes: editForm.notes || undefined,
                isActive: editForm.isActive,
              });
            }}
          >
            {t("admin.clients.save")}
          </Button>
          {updateClientMutation.isError ? (
            <ErrorState message={t("admin.clients.updateError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Assign-package sheet */}
      <AppSheet open={showAssign} onOpenChange={setShowAssign}>
        {client ? (
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {showAssignMode === "paid"
                ? t("admin.clients.newPaymentAction")
                : t("admin.clients.sheetAssign")}
            </Text>
            <AssignPackageSheetContent
              client={client}
              mode={showAssignMode}
              onSuccess={() => setShowAssign(false)}
            />
          </View>
        ) : null}
      </AppSheet>

      {/* Pause sheet */}
      <AppSheet open={showPause} onOpenChange={setShowPause}>
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.clients.sheetPause")}
          </Text>
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
            disabled={
              pauseMutation.isPending ||
              !pauseForm.startsAt ||
              !pauseForm.endsAt ||
              !client
            }
            onPress={() => {
              if (!client) return;
              pauseMutation.mutate({
                clientProfileId: client.id,
                startsAt: pauseForm.startsAt,
                endsAt: pauseForm.endsAt,
                reason: pauseForm.reason || undefined,
              });
            }}
          >
            {t("admin.clients.pauseSubmit")}
          </Button>
          {pauseMutation.isError ? (
            <ErrorState message={t("admin.clients.pauseError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Delete confirmation */}
      <AppSheet open={showDelete} onOpenChange={setShowDelete}>
        {client ? (
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
                onPress={() => setShowDelete(false)}
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
                  setShowDelete(false);
                }}
              >
                {t("admin.clients.delete")}
              </Button>
            </View>
          </View>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}

// ─── PackageStatusPill ────────────────────────────────────────────────────────

function PackageStatusPill({
  status,
}: {
  status: "active" | "expiring" | "paused" | "expired" | "none";
}) {
  const { t } = useTranslation();
  if (status === "active") {
    return <Badge status="success">{t("admin.clientDetail.status.active")}</Badge>;
  }
  if (status === "expiring") {
    return <Badge status="warning">{t("admin.clientDetail.status.expiring")}</Badge>;
  }
  if (status === "paused") {
    return <Badge status="neutral">{t("admin.clientDetail.status.paused")}</Badge>;
  }
  if (status === "expired") {
    return <Badge status="danger">{t("admin.clientDetail.status.expired")}</Badge>;
  }
  return <Badge status="neutral">{t("admin.clientDetail.status.none")}</Badge>;
}

// ─── ActionRow ────────────────────────────────────────────────────────────────

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
  const tokens = useThemeTokens();
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
        color={destructive ? "#dc2626" : tokens.foreground}
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
        <Feather name="chevron-right" size={16} color={tokens.faint} />
      ) : null}
    </Pressable>
  );
}
