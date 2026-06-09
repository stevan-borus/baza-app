// PR δ (round-7 UI sweep): the flat-scroll ClientDetail page was split into
// three tabs — Pregled / Paketi / Treninzi. Why? With ~10 packages + ~10
// upcoming sessions the old layout buried "Istorija treninga →" at the
// bottom of a screen that grew unboundedly with each client's history.
// Tabs keep the page navigable at any data scale. Quick-action rows on the
// Pregled tab surface Nova uplata / Dodeli paket / Pauziraj that used to
// hide behind the pencil action sheet — discoverability fix for one-off
// admin tasks that new users won't think to look for.
//
// What stays: the pencil header icon still opens the AppSheet with the
// same five actions (power-user shortcut), all existing testIDs on the
// action sheet rows are preserved, the istorija sub-route at
// /klijenti/[id]/istorija continues to render past bookings and is now
// linked from the Treninzi tab footer.

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import dayjs from "dayjs";
import { Icon, type IconName } from "@/components/ui/icon";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { ContactSheet } from "@/components/ui/contact-sheet";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { PaginatedList } from "@/components/ui/paginated-list";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { bookingsQueries, type ClientBooking } from "@/lib/queries/bookings-queries-factory";
import {
  trainerNotesQueries,
  type TrainerNote,
} from "@/lib/queries/trainer-notes-queries-factory";
import { BookingRow } from "@/components/admin/booking-row";
import { AssignPackageSheetContent } from "@/components/admin/assign-package-sheet-content";
import { ReturnToPill } from "@/components/admin/return-to-pill";
import { TreninziSubTab } from "@/components/admin/treninzi-sub-tab";
import { ClientLegalPanel } from "@/components/admin/client-legal-panel";
import { ClientHealthPanel } from "@/components/admin/client-health-panel";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { formatDateOfBirth, parseDateOfBirth, toIsoDate } from "@/lib/date-of-birth";
import { now } from "@/lib/now";
import {
  ClientDetailTabBar,
  type ClientDetailTab,
} from "@/components/admin/client-detail-tab-bar";

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

function pickActivePackage(packages: ClientPackage[]): ClientPackage | null {
  const nowMs = Date.now();
  for (const p of packages) {
    if (p.sessionsRemaining <= 0) continue;
    if (new Date(p.expiresAt).getTime() < nowMs) continue;
    return p;
  }
  return null;
}

export function ClientDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();

  // Tab state — Pregled is the default landing tab. State-based, not
  // expo-router nested tabs: the three tabs share a single sticky header +
  // single set of mounted AppSheets; nesting would duplicate that shell on
  // every tab change and re-run queries.
  const [activeTab, setActiveTab] = useState<ClientDetailTab>("pregled");

  const [showActions, setShowActions] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAssignMode, setShowAssignMode] = useState<"comp" | "paid">("comp");
  const [showPause, setShowPause] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showContact, setShowContact] = useState(false);

  const [editForm, setEditForm] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    notes: string;
    isActive: boolean;
    dateOfBirth: Date | null;
  }>({ firstName: "", lastName: "", phone: "", notes: "", isActive: true, dateOfBirth: null });
  const [pauseForm, setPauseForm] = useState({ startsAt: "", endsAt: "", reason: "" });

  const clientQuery = useQuery(clientsQueries.byId(id));
  const client = clientQuery.data?.client;

  const packagesQuery = useQuery({
    ...packagesQueries.clientPackages(client?.id),
    enabled: !!client?.id,
  });

  const upcomingQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({ clientUserId: id, period: "upcoming", limit: 20 }),
    enabled: !!id,
  });

  const allPackages = useMemo(
    () => packagesQuery.data?.packages ?? [],
    [packagesQuery.data?.packages],
  );
  const activePackage = useMemo(() => pickActivePackage(allPackages), [allPackages]);

  // Treninzi tab + Pregled-preview both read from the same infinite query.
  // Pregled shows the first three; Treninzi shows the full paginated list.
  const upcomingBookings = useMemo<ClientBooking[]>(() => {
    const pages = upcomingQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.bookings);
  }, [upcomingQuery.data?.pages]);

  const updateClientMutation = useMutation({
    ...clientsQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientsQueries.all });
      setShowEdit(false);
    },
  });
  const pauseMutation = useMutation({
    ...packagesQueries.pause(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: packagesQueries.all });
      setShowPause(false);
      setPauseForm({ startsAt: "", endsAt: "", reason: "" });
    },
  });

  const headerTitle = client?.user.fullName ?? t("admin.clientDetail.title");

  // Quick-action handlers — shared between the pencil-sheet rows and the
  // Pregled quick-action rows so both surfaces land in identical sheets.
  function openEdit() {
    if (!client) return;
    setEditForm({
      firstName: client.user.firstName,
      lastName: client.user.lastName,
      phone: client.user.phone ?? "",
      notes: client.notes ?? "",
      isActive: client.user.isActive,
      dateOfBirth: parseDateOfBirth(client.dateOfBirth ?? ""),
    });
    setShowActions(false);
    setShowEdit(true);
  }
  function openNewPayment() {
    setShowActions(false);
    setShowAssignMode("paid");
    setShowAssign(true);
  }
  function openAssign() {
    setShowActions(false);
    setShowAssignMode("comp");
    setShowAssign(true);
  }
  function openPause() {
    setShowActions(false);
    setShowPause(true);
  }
  function openDelete() {
    setShowActions(false);
    setShowDelete(true);
  }
  function openReserve() {
    if (!client) return;
    setShowActions(false);
    const qs = new URLSearchParams({
      clientProfileId: client.id,
      clientUserId: client.user.id,
      clientFullName: client.user.fullName,
    });
    router.push(`/(admin)/klijenti/rezervisi?${qs.toString()}` as Href);
  }

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
      <View style={{ flex: 1 }}>
        {clientQuery.isLoading ? (
          <View style={{ paddingTop: 16, paddingHorizontal: 20, gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}
        {clientQuery.isError ? (
          <View style={{ paddingTop: 16, paddingHorizontal: 20 }}>
            <ErrorState message={t("admin.clientDetail.loadError")} />
          </View>
        ) : null}

        {client ? (
          <>
            {/* Sticky header strip — identity sits pinned above the tab bar. */}
            <View
              style={{
                paddingTop: 16,
                paddingHorizontal: 20,
                paddingBottom: 12,
                gap: 12,
              }}
            >
              <ReturnToPill testID="client-detail-return-to-pill" />
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
                    <Pressable
                      testID="client-detail-email"
                      onPress={() =>
                        void Linking.openURL(
                          `mailto:${client.user.email}`,
                        ).catch(() => {})
                      }
                      accessibilityRole="link"
                    >
                      <Text
                        className="text-accent"
                        style={{ fontSize: 13 }}
                        numberOfLines={1}
                      >
                        {client.user.email}
                      </Text>
                    </Pressable>
                    {client.user.phone ? (
                      <Pressable
                        testID="client-detail-phone"
                        onPress={() => setShowContact(true)}
                        accessibilityRole="button"
                      >
                        <Text
                          className="text-accent"
                          style={{ fontSize: 13 }}
                          numberOfLines={1}
                        >
                          {client.user.phone}
                        </Text>
                      </Pressable>
                    ) : null}
                    {client.dateOfBirth ? (
                      <View className="flex-row items-center gap-2">
                        <Text className="text-muted" style={{ fontSize: 13 }}>
                          {t("admin.clients.labelDateOfBirth")}:
                        </Text>
                        <Text className="text-foreground" style={{ fontSize: 13 }}>
                          {formatDateOfBirth(
                            parseDateOfBirth(client.dateOfBirth),
                            i18n.language === "sr" ? "sr" : "en",
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <PackageStatusPill status={client.packageStatus} />
                </View>
              </GlassCard>
              <ClientDetailTabBar active={activeTab} onChange={setActiveTab} />
            </View>

            {/* Tab body — conditional render. Cheap to remount; queries are
                cached, no measured layouts to preserve. */}
            {activeTab === "pregled" ? (
              <PregledTab
                activePackage={activePackage}
                packagesLoading={packagesQuery.isLoading}
                upcomingBookings={upcomingBookings.slice(0, 1)}
                lang={lang}
                bottomPad={bottomPad}
                clientUserId={id}
                clientFullName={client.user.fullName}
              />
            ) : null}

            {activeTab === "paketi" ? (
              <PaketiTab
                packagesQuery={packagesQuery}
                allPackages={allPackages}
                lang={lang}
                bottomPad={bottomPad}
              />
            ) : null}

            {activeTab === "treninzi" ? (
              <TreninziTab
                upcomingQuery={upcomingQuery}
                upcomingBookings={upcomingBookings}
                clientUserId={id}
                bottomPad={bottomPad}
              />
            ) : null}

            {activeTab === "beleske" ? (
              <BeleskeTab
                clientProfileId={client.id}
                lang={lang}
                bottomPad={bottomPad}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {/* Pencil-opened action sheet — power-user shortcut. The Pregled tab
          surfaces the same actions as visible rows for new admins. */}
      <AppSheet open={showActions} onOpenChange={setShowActions} stackBehavior="push">
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
              onPress={openEdit}
            />
            <ActionRow
              testID="client-action-new-payment"
              icon="dollar-sign"
              label={t("admin.clients.newPaymentAction")}
              onPress={openNewPayment}
            />
            <ActionRow
              testID="client-action-assign-package"
              icon="gift"
              label={t("admin.clients.assignPackage")}
              onPress={openAssign}
            />
            <ActionRow
              testID="client-action-pause"
              icon="pause"
              label={t("admin.clients.pause")}
              onPress={openPause}
            />
            <ActionRow
              testID="client-action-reserve"
              icon="calendar"
              label={t("admin.clients.reserveSessions", { defaultValue: "Rezerviši sesije" })}
              onPress={openReserve}
            />
            <ActionRow
              testID="client-action-delete"
              icon="trash-2"
              label={t("admin.clients.delete")}
              destructive
              onPress={openDelete}
            />
          </View>
        ) : null}
      </AppSheet>

      <AppSheet open={showEdit} onOpenChange={setShowEdit} stackBehavior="push">
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.clients.sheetEdit")}
          </Text>
          <SectionLabel>{t("admin.clients.placeholderFirstName")}</SectionLabel>
          <Input
            placeholder={t("admin.clients.placeholderFirstName")}
            value={editForm.firstName}
            onChangeText={(v) => setEditForm((s) => ({ ...s, firstName: v }))}
          />
          <SectionLabel>{t("admin.clients.placeholderLastName")}</SectionLabel>
          <Input
            placeholder={t("admin.clients.placeholderLastName")}
            value={editForm.lastName}
            onChangeText={(v) => setEditForm((s) => ({ ...s, lastName: v }))}
          />
          <SectionLabel>{t("admin.clients.placeholderPhoneRequired")}</SectionLabel>
          <Input
            placeholder={t("admin.clients.placeholderPhoneRequired")}
            keyboardType="phone-pad"
            value={editForm.phone}
            onChangeText={(v) => setEditForm((s) => ({ ...s, phone: v }))}
          />
          <SectionLabel>{t("admin.clients.labelDateOfBirth")}</SectionLabel>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <DateTimePicker
                testID="edit-client-dob-input"
                mode="date"
                value={editForm.dateOfBirth}
                onChange={(d) => setEditForm((s) => ({ ...s, dateOfBirth: d }))}
                placeholder={t("admin.clients.placeholderDateOfBirth")}
                maximumDate={now()}
                minimumDate={new Date(Date.UTC(1900, 0, 1))}
              />
            </View>
            {editForm.dateOfBirth ? (
              <Pressable
                testID="edit-client-dob-clear"
                onPress={() => setEditForm((s) => ({ ...s, dateOfBirth: null }))}
                accessibilityRole="button"
                accessibilityLabel={t("admin.clients.dateOfBirthEmpty")}
                style={{ padding: 8 }}
              >
                <Text className="text-foreground">×</Text>
              </Pressable>
            ) : null}
          </View>
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
                firstName: editForm.firstName,
                lastName: editForm.lastName,
                phone: editForm.phone || undefined,
                notes: editForm.notes || undefined,
                isActive: editForm.isActive,
                dateOfBirth: editForm.dateOfBirth
                  ? toIsoDate(editForm.dateOfBirth)
                  : null,
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

      <AppSheet open={showAssign} onOpenChange={setShowAssign} stackBehavior="push">
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

      <AppSheet open={showPause} onOpenChange={setShowPause} stackBehavior="push">
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

      <AppSheet open={showDelete} onOpenChange={setShowDelete} stackBehavior="push">
        {client ? (
          <View className="flex-col gap-5">
            <View className="items-center gap-3 pt-1">
              <View className="w-12 h-12 rounded-full bg-danger-soft items-center justify-center">
                <Icon name="alert-triangle" size={20} color="#dc2626" />
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
            <View className="flex-col gap-2">
              <Button
                testID="client-delete-confirm-button"
                variant="danger"
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
              <Button
                variant="ghost"
                onPress={() => setShowDelete(false)}
              >
                {t("common.close", { defaultValue: "Zatvori" })}
              </Button>
            </View>
          </View>
        ) : null}
      </AppSheet>

      {client?.user.phone ? (
        <ContactSheet
          open={showContact}
          onOpenChange={setShowContact}
          phone={client.user.phone}
        />
      ) : null}
    </ScreenContainerRaw>
  );
}

function PregledTab({
  activePackage,
  packagesLoading,
  upcomingBookings,
  lang,
  bottomPad,
  clientUserId,
  clientFullName,
}: {
  activePackage: ClientPackage | null;
  packagesLoading: boolean;
  upcomingBookings: ClientBooking[];
  lang: "sr" | "en";
  bottomPad: number;
  clientUserId: string;
  clientFullName: string;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      testID="client-detail-tab-content-pregled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: bottomPad,
        gap: 16,
      }}
    >
      <View className="gap-2">
        <SectionLabel>{t("admin.clientDetail.currentPackage")}</SectionLabel>
        {packagesLoading ? (
          <SkeletonCard />
        ) : activePackage ? (
          <View className="bg-surface rounded-lg p-4 gap-1">
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
        ) : (
          <EmptyState title={t("admin.clientDetail.noActivePackage")} />
        )}
      </View>

      {upcomingBookings.length > 0 ? (
        <View className="gap-2">
          <SectionLabel>{t("admin.clientDetail.nextSession")}</SectionLabel>
          <View className="bg-surface rounded-lg overflow-hidden">
            <BookingRow booking={upcomingBookings[0]!} />
          </View>
        </View>
      ) : null}

      <ClientLegalPanel
        clientUserId={clientUserId}
        clientFullName={clientFullName}
        lang={lang}
      />
      <ClientHealthPanel clientUserId={clientUserId} lang={lang} />
    </ScrollView>
  );
}

function PaketiTab({
  packagesQuery,
  allPackages,
  lang,
  bottomPad,
}: {
  packagesQuery: ReturnType<typeof useQuery>;
  allPackages: ClientPackage[];
  lang: "sr" | "en";
  bottomPad: number;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      testID="client-detail-tab-content-paketi"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: bottomPad,
        gap: 8,
      }}
    >
      <SectionLabel>{t("admin.clientDetail.packageHistory")}</SectionLabel>
      {packagesQuery.isLoading ? (
        <SkeletonCard />
      ) : packagesQuery.isError ? (
        <ErrorState message={t("admin.clientDetail.packagesError")} />
      ) : allPackages.length === 0 ? (
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
    </ScrollView>
  );
}

type TreninziSub = "upcoming" | "history";

function TreninziTab({
  upcomingQuery,
  upcomingBookings,
  clientUserId,
  bottomPad,
}: {
  upcomingQuery: ReturnType<typeof useInfiniteQuery>;
  upcomingBookings: ClientBooking[];
  clientUserId: string;
  bottomPad: number;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<TreninziSub>("upcoming");

  // The past-bookings query is started lazily — it only fires when the
  // history pill is tapped, so opening the tab doesn't fan out a second
  // request for a panel the user might never look at.
  const pastQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId,
      period: "past",
      limit: 20,
    }),
    enabled: sub === "history",
  });
  const pastBookings = useMemo<ClientBooking[]>(
    () => (pastQuery.data?.pages ?? []).flatMap((p) => p.bookings),
    [pastQuery.data?.pages],
  );

  const query = sub === "upcoming" ? upcomingQuery : pastQuery;
  const data = sub === "upcoming" ? upcomingBookings : pastBookings;

  return (
    <View
      testID="client-detail-tab-content-treninzi"
      style={{ flex: 1, paddingHorizontal: 20 }}
    >
      {/* Underline tab row — quieter than chip pills, reads unambiguously
          as sub-tabs nested under the main Pregled/Paketi/Treninzi bar. */}
      <View
        className="flex-row border-b border-glass-border"
        style={{ gap: 20, marginBottom: 12 }}
      >
        <TreninziSubTab
          testID="client-detail-treninzi-pill-upcoming"
          label={t("admin.clientDetail.upcomingTab")}
          active={sub === "upcoming"}
          onPress={() => setSub("upcoming")}
        />
        <TreninziSubTab
          testID="client-detail-treninzi-pill-history"
          label={t("admin.clientDetail.historyTab")}
          active={sub === "history"}
          onPress={() => setSub("history")}
        />
      </View>
      <PaginatedList<ClientBooking>
        query={query}
        data={data}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <View
            className="bg-surface rounded-lg overflow-hidden"
            style={{ marginBottom: 8 }}
          >
            <BookingRow
              booking={item}
              showCanceledTag={sub === "history"}
            />
          </View>
        )}
        contentContainerStyle={{
          paddingBottom: bottomPad,
        }}
        errorState={
          <ErrorState
            message={t(
              sub === "upcoming"
                ? "admin.clientDetail.upcomingError"
                : "admin.history.error",
            )}
          />
        }
        emptyState={
          <EmptyState
            title={t(
              sub === "upcoming"
                ? "admin.clientDetail.noUpcoming"
                : "admin.clientDetail.noPastBookings",
            )}
          />
        }
      />
    </View>
  );
}

function BeleskeTab({
  clientProfileId,
  lang,
  bottomPad,
}: {
  clientProfileId: string;
  lang: "sr" | "en";
  bottomPad: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<TrainerNote | null>(null);

  const notesQuery = useInfiniteQuery(
    trainerNotesQueries.listInfinite({ clientProfileIds: [clientProfileId] }),
  );
  const notes = useMemo<TrainerNote[]>(
    () => (notesQuery.data?.pages ?? []).flatMap((p) => p.notes),
    [notesQuery.data?.pages],
  );

  const deleteMutation = useMutation({
    ...trainerNotesQueries.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainerNotesQueries.all });
    },
  });

  return (
    <View
      testID="client-detail-tab-content-beleske"
      style={{ flex: 1, paddingHorizontal: 20 }}
    >
      <PaginatedList<TrainerNote>
        query={notesQuery}
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <Pressable
            testID={`beleske-row-${item.id}`}
            onPress={() => setPendingDelete(item)}
            android_ripple={null}
            className="bg-surface rounded-lg overflow-hidden active:opacity-80"
            style={{ marginBottom: 8, padding: 14 }}
          >
            <Text
              className="text-faint font-body-semibold"
              style={{
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
              numberOfLines={1}
            >
              {item.trainer?.fullName ?? t("admin.clientDetail.beleske.unknownTrainer")} ·{" "}
              {dayjs(item.createdAt).locale(lang).format("D.M.YYYY.")}
            </Text>
            <Text
              className="text-foreground"
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {item.note}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        errorState={
          <ErrorState message={t("admin.clientDetail.beleske.error")} />
        }
        emptyState={
          <EmptyState title={t("admin.clientDetail.beleske.empty")} />
        }
      />

      {/* Tap-to-delete confirmation. The only thing an admin does to a
          note from this surface is remove it — tap on row → confirm.
          The trainer who wrote the note is not notified of deletion. */}
      <ConfirmSheet
        testID="beleske-confirm-delete"
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title={t("admin.clientDetail.beleske.confirmDelete")}
        message={t("admin.clientDetail.beleske.confirmDeleteBody")}
        confirmLabel={t("admin.clientDetail.beleske.confirm")}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
      />
    </View>
  );
}

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

function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  testID,
}: {
  icon: IconName;
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
      <Icon
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
        <Icon name="chevron-right" size={16} color={tokens.faint} />
      ) : null}
    </Pressable>
  );
}

