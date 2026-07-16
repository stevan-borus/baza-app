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
//
// The per-section rendering lives in child components under
// ./client-detail/* — this file owns the screen shell: state, queries, the
// quick-action handlers, and the action/edit/assign/pause/delete sheets.

import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { ContactSheet } from "@/components/ui/contact-sheet";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { clientsQueries, useUpdateClientMutation } from "@/lib/queries/clients-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import { bookingsQueries, type ClientBooking } from "@/lib/queries/bookings-queries-factory";
import {
  EditClientSheet,
  type EditClientSheetClient,
} from "@/components/admin/client-flows/edit-client-sheet";
import { PauseSheet } from "@/components/admin/client-flows/pause-sheet";
import { AssignPackageSheetContent } from "@/components/admin/assign-package-sheet-content";
import { ReturnToPill } from "@/components/admin/return-to-pill";
import { nowMs } from "@/lib/now";
import {
  ClientDetailTabBar,
  type ClientDetailTab,
} from "@/components/admin/client-detail-tab-bar";
import { InitialsAvatar } from "@/components/admin/client-detail/InitialsAvatar";
import { ActionRow } from "@/components/admin/client-detail/ActionRow";
import { ClientDetailHeaderCard } from "@/components/admin/client-detail/ClientDetailHeaderCard";
import { PregledTab } from "@/components/admin/client-detail/PregledTab";
import { PaketiTab } from "@/components/admin/client-detail/PaketiTab";
import { TreninziTab } from "@/components/admin/client-detail/TreninziTab";
import { BeleskeTab } from "@/components/admin/client-detail/BeleskeTab";

function pickActivePackage(packages: ClientPackage[]): ClientPackage | null {
  const msNow = nowMs();
  for (const p of packages) {
    if (p.revokedAt) continue;
    if (p.sessionsRemaining <= 0) continue;
    if (new Date(p.expiresAt).getTime() < msNow) continue;
    return p;
  }
  return null;
}

export function ClientDetail({ id }: { id: string }) {
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
  const [showAssign, setShowAssign] = useState(false);
  const [showAssignMode, setShowAssignMode] = useState<"comp" | "paid">("comp");
  const [showDelete, setShowDelete] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // Edit + pause live in the shared client-flows modules (the klijenti list
  // screen is the other consumer). One state variable per flow: the edit
  // sheet is open while `editClient` is non-null (a snapshot built at
  // "Izmeni" press time, same as the old press-time form seeding), the
  // pause sheet while `pauseClientId` is non-null.
  const [editClient, setEditClient] = useState<EditClientSheetClient | null>(null);
  const [pauseClientId, setPauseClientId] = useState<string | null>(null);

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

  const allPackages = packagesQuery.data?.packages ?? [];
  const activePackage = pickActivePackage(allPackages);

  // Treninzi tab + Pregled-preview both read from the same infinite query.
  // Pregled shows the first three; Treninzi shows the full paginated list.
  const upcomingBookings: ClientBooking[] = (upcomingQuery.data?.pages ?? []).flatMap(
    (p) => p.bookings,
  );

  // Kept for the delete sheet only — edit's copy of this mutation now lives
  // inside the shared EditClientSheet module. Cache upkeep (clients + reports
  // counts) is baked into the factory hook.
  const updateClientMutation = useUpdateClientMutation();

  const headerTitle = client?.user.fullName ?? t("admin.clientDetail.title");

  // Quick-action handlers — shared between the pencil-sheet rows and the
  // Pregled quick-action rows so both surfaces land in identical sheets.
  function openEdit() {
    if (!client) return;
    setShowActions(false);
    // Snapshot at press time (the old code seeded the form here). The
    // `dateOfBirth` key and `user.isActive` are what unlock the DOB picker
    // and the seeded Aktivan switch in the shared sheet; `id` is the User
    // id because PATCH /api/clients/:id resolves by userId.
    setEditClient({
      id: client.user.id,
      user: {
        firstName: client.user.firstName,
        lastName: client.user.lastName,
        phone: client.user.phone,
        isActive: client.user.isActive,
      },
      notes: client.notes,
      dateOfBirth: client.dateOfBirth,
    });
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
    if (!client) return;
    setShowActions(false);
    setPauseClientId(client.id);
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
              <ClientDetailHeaderCard
                client={client}
                onPressPhone={() => setShowContact(true)}
              />
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

      {/* Shared client-flows module (also used by the klijenti list). No
          onBack: this screen has no previous sheet step, so the header is
          the bare title, as before the dedupe. */}
      <EditClientSheet client={editClient} onClose={() => setEditClient(null)} />

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

      {/* Shared client-flows module (also used by the klijenti list). */}
      <PauseSheet
        clientProfileId={pauseClientId}
        onClose={() => setPauseClientId(null)}
      />

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
            {updateClientMutation.isError ? (
              <ErrorState message={t("admin.clients.deleteError")} />
            ) : null}
            <View className="flex-col gap-2">
              <Button
                testID="client-delete-confirm-button"
                variant="danger"
                disabled={updateClientMutation.isPending}
                onPress={() => {
                  // Close only on success — a failed soft-delete keeps the
                  // sheet open and surfaces the error instead of silently
                  // dismissing (which read as "delete did nothing").
                  updateClientMutation.mutate(
                    { id: client.user.id, isActive: false },
                    { onSuccess: () => setShowDelete(false) },
                  );
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
