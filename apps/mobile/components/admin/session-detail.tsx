import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import dayjs from "dayjs";
import { Icon } from "@/components/ui/icon";
import { GlassCard } from "@/components/ui/glass-card";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { useThemeTokens } from "@/components/ui/tokens";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CapsLabel } from "@/components/ui/studio/typography";
import {
  SessionEditSheet,
  useSessionEditSheet,
} from "@/components/ui/session-edit-sheet";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useCancelReservationsBulkMutation } from "@/lib/queries/reservations-queries-factory";
import { ReturnToPill } from "@/components/admin/return-to-pill";

type SessionDetailProps = {
  id: string;
  /**
   * Builds the route to a client detail page from a `userId`. Defaults to
   * the Klijenti tab. Pass a different builder (e.g. from the Pregled
   * wrapper) to keep the back-stack inside the current tab.
   */
  buildClientHref?: (clientUserId: string) => Href;
};

const defaultBuildClientHref = (clientUserId: string): Href =>
  `/(admin)/klijenti/${clientUserId}` as Href;

export function SessionDetail({
  id,
  buildClientHref = defaultBuildClientHref,
}: SessionDetailProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const editSheet = useSessionEditSheet();

  const query = useQuery(sessionsQueries.byId(id));
  const session = query.data?.session;

  // Only admins may edit a session. Trainers get a read-only view (the PATCH
  // endpoint enforces this server-side too). Derived from the role rather than
  // a prop so a route wrapper can't accidentally expose the edit affordance.
  const meQuery = useQuery(authQueries.me());
  const canEdit = meQuery.data?.user.role === "ADMIN";

  // Long-press on a booked row (admin only) opens the excuse-&-remove sheet.
  const [excuseTarget, setExcuseTarget] = useState<{
    bookingId: string;
    clientFullName: string;
    clientUserId: string;
  } | null>(null);

  const headerTitle = session?.classType?.name ?? t("admin.sessionDetail.title");
  const dateLabel = session
    ? dayjs(session.startsAt).locale(lang).format("dddd, D. MMMM YYYY")
    : "";
  const timeLabel = session
    ? `${dayjs(session.startsAt).format("HH:mm")} – ${dayjs(session.endsAt).format("HH:mm")}`
    : "";
  const bookedCount = session?.bookings.length ?? 0;
  const capacity = session?.capacity ?? 0;

  return (
    <ScreenContainerRaw
      title={headerTitle}
      headerVariant="detail"
      rightSlot={
        session && canEdit ? (
          <HeaderIconButton
            testID="session-detail-edit-button"
            icon="pencil"
            onPress={() => {
              if (!session) return;
              editSheet.openForSession({
                id: session.id,
                classTypeName: session.classType?.name ?? "",
                roomId: session.roomId ?? null,
                roomName: session.room?.name ?? null,
                trainerUserId: session.trainerUserId ?? null,
                bookedCount: session.bookedCount,
                seriesBookedCount: session.seriesBookedCount,
                capacity: session.capacity,
                startsAt: session.startsAt,
                endsAt: session.endsAt,
                recurringScheduleId: session.recurringScheduleId ?? null,
                isActive: session.isActive,
              });
            }}
            accessibilityLabel={t("admin.sessionDetail.editAction")}
          />
        ) : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 16,
        }}
      >
        <ReturnToPill testID="session-detail-return-to-pill" />

        {query.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}

        {query.isError ? (
          <ErrorState message={t("admin.sessionDetail.loadError")} />
        ) : null}

        {session ? (
          <>
            <GlassCard size="md">
              <View style={{ gap: 8 }}>
                <Text className="text-foreground font-body-bold" style={{ fontSize: 18 }}>
                  {dateLabel}
                </Text>
                <Text className="text-muted" style={{ fontSize: 14 }}>
                  {timeLabel}
                </Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="user" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {session.trainer?.fullName ?? "—"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="home" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {session.room?.name ?? "—"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="users" size={13} color={tokens.muted} />
                    <Text className="text-muted" style={{ fontSize: 13 }}>
                      {bookedCount}/{capacity}
                    </Text>
                  </View>
                </View>
              </View>
            </GlassCard>

            <View style={{ gap: 10 }}>
              <SectionLabel>{t("admin.sessionDetail.bookedClients")}</SectionLabel>
              {bookedCount === 0 ? (
                <EmptyState title={t("admin.sessionDetail.noBookings")} />
              ) : (
                session.bookings.map((b) => (
                  <ClientRow
                    key={b.id}
                    testID={`session-detail-booking-${b.id}`}
                    client={b.client}
                    consentFlags={b.consentFlags}
                    onPress={() => router.push(buildClientHref(b.client.id))}
                    onLongPress={
                      canEdit
                        ? () =>
                            setExcuseTarget({
                              bookingId: b.id,
                              clientFullName: b.client.fullName,
                              clientUserId: b.client.id,
                            })
                        : undefined
                    }
                  />
                ))
              )}
            </View>

            {/* Waitlist — only rendered when someone is queued. */}
            {session.waitlist.length > 0 ? (
              <View style={{ gap: 10 }}>
                <SectionLabel>
                  {t("admin.sessionDetail.waitlistClients")}
                </SectionLabel>
                {session.waitlist.map((w) => (
                  <ClientRow
                    key={w.id}
                    testID={`session-detail-waitlist-${w.id}`}
                    client={w.client}
                    consentFlags={w.consentFlags}
                    position={w.position}
                    onPress={() => router.push(buildClientHref(w.client.id))}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {canEdit ? <SessionEditSheet {...editSheet.bind()} /> : null}
      {canEdit ? (
        <ExcuseRemoveSheet
          key={excuseTarget?.bookingId ?? "none"}
          target={excuseTarget}
          onClose={() => setExcuseTarget(null)}
          onOpenClient={() => {
            const t = excuseTarget;
            setExcuseTarget(null);
            if (t) router.push(buildClientHref(t.clientUserId));
          }}
        />
      ) : null}
    </ScreenContainerRaw>
  );
}

type RowClient = { id: string; fullName: string; email: string };

/**
 * One client row on the session detail — used for both booked and waitlisted
 * clients so they look identical. Avatar initials + name + email + chevron,
 * tappable through to the client. A `position` (waitlist queue number) renders
 * as a small badge on the avatar when provided.
 */
function ClientRow({
  client,
  consentFlags,
  onPress,
  onLongPress,
  testID,
  position,
}: {
  client: RowClient;
  consentFlags: ConsentFlags;
  onPress: () => void;
  onLongPress?: () => void;
  testID: string;
  position?: number;
}) {
  const tokens = useThemeTokens();
  const initials = client.fullName
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={null}
      className="active:opacity-70"
    >
      <GlassCard size="md">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
            <Text className="text-accent font-body-bold" style={{ fontSize: 13 }}>
              {initials}
            </Text>
            {position !== undefined ? (
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent items-center justify-center">
                <Text
                  className="text-white font-body-bold"
                  style={{ fontSize: 10 }}
                >
                  {position}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              className="text-foreground font-body-semibold"
              style={{ fontSize: 15 }}
              numberOfLines={1}
            >
              {client.fullName}
            </Text>
            <Text className="text-muted" style={{ fontSize: 12 }} numberOfLines={1}>
              {client.email}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={tokens.faint} />
        </View>
        <BookingConsentFlags flags={consentFlags} />
      </GlassCard>
    </Pressable>
  );
}

type ConsentFlags = {
  showFirstPilatesHint: boolean;
  conditions: string[];
  conditionsOther: string | null;
  additionalNotes: string | null;
  intakeRecorded: boolean;
  intakeWithdrawn: boolean;
  socialMediaAccepted: boolean | null;
};

/**
 * Per-booking consent strip rendered below the client name on each session-
 * detail booking row. Surfaces health conditions (as chips), free-text notes,
 * photo/video consent state, and an explicit "withdrawn consent" banner when
 * the client revoked their health intake.
 */
function BookingConsentFlags({ flags }: { flags: ConsentFlags }) {
  const { t } = useTranslation();
  if (flags.intakeWithdrawn) {
    return (
      <View className="mt-2 rounded-lg border border-glass-border bg-glass px-3 py-2">
        <Text className="text-[12px] text-muted">
          {t("admin.sessionDetail.healthWithdrawn")}
        </Text>
        <SocialMediaPill accepted={flags.socialMediaAccepted} />
      </View>
    );
  }
  const hasConditions = flags.conditions.length > 0 || !!flags.conditionsOther;
  if (
    !flags.intakeRecorded &&
    flags.socialMediaAccepted === null &&
    !flags.showFirstPilatesHint
  ) {
    return null;
  }
  return (
    <View className="mt-2 gap-2">
      {hasConditions ? (
        <View className="flex-row flex-wrap gap-2">
          {flags.conditions.map((code) => (
            <FlagBadge
              key={code}
              label={t(`intake.conditions.${code}`, { defaultValue: code })}
            />
          ))}
          {flags.conditionsOther ? (
            <FlagBadge label={flags.conditionsOther} />
          ) : null}
        </View>
      ) : null}
      {flags.additionalNotes ? (
        <Text className="text-[12px] text-muted">
          <Text className="font-body-semibold text-foreground">
            {t("admin.sessionDetail.notesLabel")}:{" "}
          </Text>
          {flags.additionalNotes}
        </Text>
      ) : null}
      {flags.showFirstPilatesHint ? (
        <Text className="text-[11px] text-muted">
          {t("admin.sessionDetail.hintFirstPilates")}
        </Text>
      ) : null}
      <SocialMediaPill accepted={flags.socialMediaAccepted} />
    </View>
  );
}

function FlagBadge({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5">
      <Text className="text-[11px] text-warning font-body-semibold">
        {label}
      </Text>
    </View>
  );
}

function SocialMediaPill({ accepted }: { accepted: boolean | null }) {
  const { t } = useTranslation();
  if (accepted === null) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon
        name={accepted ? "camera" : "camera-off"}
        size={12}
        color={accepted ? "#16a34a" : "#dc2626"}
      />
      <Text
        className={`text-[11px] font-body-semibold ${
          accepted ? "text-success" : "text-danger"
        }`}
      >
        {accepted
          ? t("admin.sessionDetail.photoConsentYes")
          : t("admin.sessionDetail.photoConsentNo")}
      </Text>
    </View>
  );
}

/**
 * Admin action sheet opened by long-pressing a booked client on the session
 * detail. Offers "open client" and an "excuse & remove" cancel that reuses the
 * bulk-cancel endpoint with a single bookingId. The charge waiver toggle
 * (default OFF) mirrors the bulk reservation-cancel sheet so both admin cancel
 * surfaces behave identically.
 */
function ExcuseRemoveSheet({
  target,
  onClose,
  onOpenClient,
}: {
  target: { bookingId: string; clientFullName: string; clientUserId: string } | null;
  onClose: () => void;
  onOpenClient: () => void;
}) {
  const { t } = useTranslation();
  const cancelMut = useCancelReservationsBulkMutation();
  // The toggle defaults OFF on every open: the parent remounts this component
  // via a `key` tied to the targeted booking, so no reset effect is needed.
  const [waiveCharge, setWaiveCharge] = useState(false);

  return (
    <AppSheet open={target !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <View className="flex-col" testID="session-detail-excuse-sheet">
        <View className="pb-3">
          <CapsLabel size={9} tracking={1.6} className="text-muted">
            {t("admin.sessionDetail.excuseClientLabel", { defaultValue: "Klijent" })}
          </CapsLabel>
          <Text
            className="text-foreground font-display"
            style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.4, paddingTop: 2 }}
            numberOfLines={1}
          >
            {target?.clientFullName ?? ""}
          </Text>
        </View>

        <Pressable
          testID="session-detail-excuse-open-client"
          onPress={onOpenClient}
          className="flex-row items-center justify-between py-3 active:opacity-70"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" }}
        >
          <Text className="text-foreground" style={{ fontSize: 15 }}>
            {t("admin.sessionDetail.openClient", { defaultValue: "Otvori klijenta" })}
          </Text>
          <Icon name="chevron-right" size={16} color="#999" />
        </Pressable>

        <View
          className="flex-row items-center justify-between py-3"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" }}
        >
          <View className="flex-1 pr-3">
            <Text
              className="text-foreground"
              style={{ fontSize: 14, lineHeight: 18, fontWeight: "600" }}
            >
              {t("admin.reservations.waiveChargeLabel", {
                defaultValue: "Ne naplaćuj ovu sesiju",
              })}
            </Text>
            <Text className="text-muted" style={{ fontSize: 12, lineHeight: 16, paddingTop: 2 }}>
              {t("admin.reservations.waiveChargeHint", {
                defaultValue: "Klijent neće izgubiti sesiju iz paketa.",
              })}
            </Text>
          </View>
          <Switch
            testID="session-detail-excuse-waive-switch"
            value={waiveCharge}
            onValueChange={setWaiveCharge}
          />
        </View>

        <View className="flex-row gap-3 pt-4">
          <Button variant="secondary" className="flex-1" onPress={onClose}>
            {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
          </Button>
          <Button
            testID="session-detail-excuse-confirm"
            variant="danger"
            className="flex-1"
            disabled={cancelMut.isPending || target === null}
            onPress={() => {
              if (!target) return;
              cancelMut.mutate(
                { bookingIds: [target.bookingId], waiveCharge },
                { onSuccess: onClose },
              );
            }}
          >
            {t("admin.sessionDetail.excuseRemoveCta", { defaultValue: "Otkaži termin" })}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
