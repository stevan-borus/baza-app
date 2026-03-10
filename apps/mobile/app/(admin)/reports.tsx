import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

export default function AdminReports() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }
  const summaryQuery = useQuery(reportsQueries.summary());
  const revenueQuery = useQuery(reportsQueries.revenue({ period: "month" }));
  const utilizationQuery = useQuery(
    reportsQueries.utilization({ period: "month" }),
  );
  const bookingsQuery = useQuery(
    reportsQueries.bookings({ period: "month" }),
  );
  const summary = summaryQuery.data?.summary;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 12,
        paddingHorizontal: 24,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 20,
      }}
    >
      {summaryQuery.isError ? (
        <ErrorState message={t("admin.manage.reportsError")} />
      ) : null}
      {summary ? (
        <YStack gap="$3">
          <XStack gap="$3">
            <YStack flex={1}>
              <StatCard
                label={t("admin.dashboard.activeClients")}
                value={summary.activeClients}
                icon="check-circle"
              />
            </YStack>
            <YStack flex={1}>
              <StatCard
                label={t("admin.manage.totalClients")}
                value={summary.totalClients}
                icon="users"
              />
            </YStack>
          </XStack>
          <XStack gap="$3">
            <YStack flex={1}>
              <StatCard
                label={t("admin.dashboard.revenue")}
                value={summary.revenue}
                icon="money"
              />
            </YStack>
            <YStack flex={1}>
              <StatCard
                label={t("admin.manage.payment")}
                value={summary.totalPayments}
                icon="credit-card"
              />
            </YStack>
          </XStack>
        </YStack>
      ) : null}

      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$5" color="$color">
          {t("admin.manage.monthlyRevenue")}
        </Text>
        {revenueQuery.isError ? (
          <ErrorState message={t("admin.manage.revenueError")} />
        ) : null}
        {!revenueQuery.isError &&
        !revenueQuery.isLoading &&
        (revenueQuery.data?.data ?? []).length === 0 ? (
          <EmptyState title={t("admin.manage.revenueEmpty")} />
        ) : null}
        {(revenueQuery.data?.data ?? []).map((item) => (
          <Card key={item.period}>
            <XStack justify="space-between" items="center">
              <Text fontWeight="500" color="$color">
                {item.period}
              </Text>
              <Text fontWeight="600" color="$accent1">
                {item.revenue} RSD ({item.count})
              </Text>
            </XStack>
          </Card>
        ))}
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$5" color="$color">
          {t("admin.manage.utilization")}
        </Text>
        {utilizationQuery.isError ? (
          <ErrorState message={t("admin.manage.utilizationError")} />
        ) : null}
        {!utilizationQuery.isError &&
        !utilizationQuery.isLoading &&
        (utilizationQuery.data?.data ?? []).length === 0 ? (
          <EmptyState title={t("admin.manage.utilizationEmpty")} />
        ) : null}
        {(utilizationQuery.data?.data ?? []).map((item) => (
          <Card key={item.period}>
            <XStack justify="space-between" items="center">
              <Text fontWeight="500" color="$color">
                {item.period}
              </Text>
              <Text fontWeight="600" color="$accent1">
                {item.totalBooked}/{item.totalCapacity} (
                {Math.round(item.utilization * 100)}%)
              </Text>
            </XStack>
          </Card>
        ))}
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$5" color="$color">
          {t("admin.manage.bookings")}
        </Text>
        {bookingsQuery.isError ? (
          <ErrorState message={t("admin.manage.bookingsError")} />
        ) : null}
        {!bookingsQuery.isError &&
        !bookingsQuery.isLoading &&
        (bookingsQuery.data?.data ?? []).length === 0 ? (
          <EmptyState title={t("admin.manage.bookingsEmpty")} />
        ) : null}
        {(bookingsQuery.data?.data ?? []).map((item) => (
          <Card key={item.period}>
            <XStack justify="space-between" items="center">
              <Text fontWeight="500" color="$color">
                {item.period}
              </Text>
              <Text fontWeight="600" color="$accent1">
                {item.bookings}
              </Text>
            </XStack>
          </Card>
        ))}
      </YStack>
    </ScrollView>
  );
}

