import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
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
import {
  SessionEditSheet,
  useSessionEditSheet,
} from "@/components/ui/session-edit-sheet";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
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
        session ? (
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
      <SessionEditSheet {...editSheet.bind()} />
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
  testID,
  position,
}: {
  client: RowClient;
  consentFlags: ConsentFlags;
  onPress: () => void;
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
