import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { EmptyState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { type ClientBooking } from "@/lib/queries/bookings-queries-factory";
import { BookingRow } from "@/components/admin/booking-row";
import { ClientLegalPanel } from "@/components/admin/client-legal-panel";
import { ClientHealthPanel } from "@/components/admin/client-health-panel";
import { formatClassTypeList } from "@/lib/format";
import { PauseCard, type ClientPause } from "@/components/admin/client-detail/PauseCard";

export function PregledTab({
  activePackage,
  packagesLoading,
  upcomingBookings,
  lang,
  bottomPad,
  clientUserId,
  clientFullName,
  activePause,
  upcomingPause,
  onEditPause,
}: {
  activePackage: ClientPackage | null;
  packagesLoading: boolean;
  upcomingBookings: ClientBooking[];
  lang: "sr" | "en";
  bottomPad: number;
  clientUserId: string;
  clientFullName: string;
  activePause: ClientPause | null;
  /** Optional: a client payload cached before the field shipped has none. */
  upcomingPause?: ClientPause | null;
  onEditPause: (pause: ClientPause, kind: "active" | "upcoming") => void;
}) {
  const { t } = useTranslation();
  // A running pause outranks a scheduled one: it is what the client is living
  // with today, and the scheduled one surfaces again once this one is over.
  const pause: { pause: ClientPause; kind: "active" | "upcoming" } | null =
    activePause
      ? { pause: activePause, kind: "active" }
      : upcomingPause
        ? { pause: upcomingPause, kind: "upcoming" }
        : null;
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
      {pause ? (
        <PauseCard
          pause={pause.pause}
          kind={pause.kind}
          lang={lang}
          onEditPause={onEditPause}
        />
      ) : null}

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
            {(activePackage.classTypes ?? []).length > 0 ? (
              <Text className="text-muted" style={{ fontSize: 13 }} numberOfLines={1}>
                {formatClassTypeList(
                  (activePackage.classTypes ?? []).map((ct) => ct.name),
                )}
              </Text>
            ) : null}
            {typeof activePackage.bookable === "number" ? (
              // sessionsRemaining only drops when a session is CONSUMED, so a
              // client with an upcoming reservation still shows the full count.
              // Printing it beside a reserved count reads as a contradiction
              // ("Rezervisano: 1" next to 12/12). Bookable — remaining minus
              // held seats — is the number that answers whether they can book.
              <Text
                testID="client-package-bookable"
                className="text-foreground"
                style={{ fontSize: 13 }}
              >
                {t("admin.clientDetail.sessionsBookable", {
                  bookable: activePackage.bookable,
                  // Grant-aware total (server: sessionCount + bonusSessions).
                  total: activePackage.sessionsTotal ?? "—",
                })}
              </Text>
            ) : (
              <Text className="text-muted" style={{ fontSize: 13 }}>
                {t("admin.clientDetail.sessionsRemaining", {
                  remaining: activePackage.sessionsRemaining,
                  // Grant-aware total (server: sessionCount + bonusSessions), so
                  // a "+1 termin" grant reads 13/13, not 13/12.
                  total: activePackage.sessionsTotal ?? "—",
                })}
              </Text>
            )}
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
