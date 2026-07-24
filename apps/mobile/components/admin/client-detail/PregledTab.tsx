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

export function PregledTab({
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
            {(activePackage.classTypes ?? []).length > 0 ? (
              <Text className="text-muted" style={{ fontSize: 13 }} numberOfLines={1}>
                {formatClassTypeList(
                  (activePackage.classTypes ?? []).map((ct) => ct.name),
                )}
              </Text>
            ) : null}
            <Text className="text-muted" style={{ fontSize: 13 }}>
              {t("admin.clientDetail.sessionsRemaining", {
                remaining: activePackage.sessionsRemaining,
                // Grant-aware total (server: sessionCount + bonusSessions), so a
                // "+1 termin" grant reads 13/13, not 13/12.
                total: activePackage.sessionsTotal ?? "—",
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
