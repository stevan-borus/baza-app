/**
 * Client packages-&-payments timeline ("Moji paketi").
 *
 * Read-only mirror of admin Naplata through a PACKAGE lens: every package
 * the client has held, newest first. PAID entries show amount + softened
 * method chip; COMP entries (Poklon paket) show the "Poklon paket" label
 * with no amount. Method is already softened server-side (COMPANY -> PAID,
 * MANUAL_ONLINE -> ONLINE) so the UI just maps the four allowed values to
 * localized chip copy via the shared payment-method-labels module.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { CapsLabel } from "@/components/ui/studio";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { formatRsd } from "@/lib/format";
import { getDateLocale } from "@/lib/i18n";
import { now } from "@/lib/now";
import { softenedMethodLabelKey } from "@/lib/payment-method-labels";
import {
  clientPackagesTimelineQueries,
  type ClientPackageTimelineEntry,
} from "@/lib/queries/client-packages-timeline-queries-factory";

function methodLabel(
  method: ClientPackageTimelineEntry["method"],
  t: (key: string) => string,
): string | null {
  const key = softenedMethodLabelKey(method);
  return key ? t(key) : null;
}

export default function ClientPackagesTimeline() {
  const { t } = useTranslation();
  const dateLocale = getDateLocale();
  const bottomPad = useTabBarBottomPadding();
  const query = useQuery(clientPackagesTimelineQueries.list());
  const entries = query.data?.entries ?? [];

  if (query.isError) {
    return (
      <ScreenContainerRaw
        title={t("client.clientPackages.title")}
        headerVariant="detail"
      >
        <ErrorState message={t("client.clientPackages.error")} />
      </ScreenContainerRaw>
    );
  }

  if (query.isLoading) {
    return (
      <ScreenContainerRaw
        title={t("client.clientPackages.title")}
        headerVariant="detail"
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottomPad,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonList count={4} />
        </ScrollView>
      </ScreenContainerRaw>
    );
  }

  if (entries.length === 0) {
    return (
      <ScreenContainerRaw
        title={t("client.clientPackages.title")}
        headerVariant="detail"
      >
        <EmptyState title={t("client.clientPackages.empty")} />
      </ScreenContainerRaw>
    );
  }

  return (
    <ScreenContainerRaw
      title={t("client.clientPackages.title")}
      headerVariant="detail"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {entries.map((entry: ClientPackageTimelineEntry) => {
          const purchased = new Date(entry.createdAt);
          const expires = new Date(entry.expiresAt);
          // Keep "used up" and "date-expired" distinct — admin shows them as
          // separate badges, and a client with sessions left but past expiry
          // is a different story from one who simply spent every session.
          const usedUp = entry.sessionsRemaining <= 0;
          const dateExpired = expires < now();
          const isInactive = usedUp || dateExpired;
          // A pay-later package is PAID lineage but not yet paid: show
          // "Nije plaćeno" in place of the method chip. Reading only CONFIRMED
          // billing used to render it as COMP ("Poklon") — a lie in the
          // client's own history.
          const chip = entry.paymentPending
            ? t("client.clientPackages.notPaid")
            : entry.kind === "COMP"
              ? t("client.clientPackages.comp")
              : methodLabel(entry.method, t);
          return (
            <View
              key={entry.id}
              testID={`client-package-row-${entry.id}`}
              accessibilityLabel={t("client.clientPackages.rowLabel", {
                name: entry.packageTypeName,
                date: purchased.toLocaleDateString(dateLocale),
              })}
              className="bg-surface rounded-lg p-4 gap-2"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3 gap-1">
                  {chip ? (
                    <CapsLabel
                      size={10}
                      tracking={1.6}
                      className={
                        entry.paymentPending
                          ? "text-warning"
                          : entry.kind === "COMP"
                            ? "text-accent"
                            : "text-muted"
                      }
                    >
                      {chip}
                    </CapsLabel>
                  ) : null}
                  <Text
                    className="font-body-semibold text-foreground"
                    style={{
                      fontSize: 17,
                      letterSpacing: -0.3,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {entry.packageTypeName}
                  </Text>
                </View>
                {entry.kind === "PAID" && entry.amount !== null ? (
                  <Text
                    className="font-body-bold text-foreground"
                    style={{ fontSize: 18, letterSpacing: -0.4 }}
                  >
                    {formatRsd(entry.amount)}
                  </Text>
                ) : null}
              </View>
              <Text className="text-muted text-[12px]">
                {t("client.clientPackages.purchasedOn", {
                  date: purchased.toLocaleDateString(dateLocale),
                })}
              </Text>
              <Text
                className={
                  isInactive
                    ? "text-faint text-[12px]"
                    : "text-muted text-[12px]"
                }
              >
                {usedUp
                  ? t("client.clientPackages.usedUp")
                  : dateExpired
                    ? t("client.clientPackages.expired")
                    : t("client.clientPackages.expires", {
                        date: expires.toLocaleDateString(dateLocale),
                      })}
              </Text>
              {isInactive ? null : (
                <Text className="text-muted text-[12px]">
                  {t("client.clientPackages.sessionsRemaining", {
                    count: entry.sessionsRemaining,
                  })}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
