import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { CartesianChart, Bar } from "victory-native";
import { Card, StatCard } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SegmentedControl } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/typography";
import { ACCENT } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

type Period = "week" | "month" | "quarter";

export default function AdminReports() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const insets = useSafeAreaInsets();

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }

  const summaryQuery = useQuery(reportsQueries.summary());
  const revenueQuery = useQuery(reportsQueries.revenue({ period }));
  const utilizationQuery = useQuery(reportsQueries.utilization({ period }));
  const bookingsQuery = useQuery(reportsQueries.bookings({ period }));
  const summary = summaryQuery.data?.summary;

  const bookingsData = (bookingsQuery.data?.data ?? []).map((item, i) => ({
    x: i,
    y: item.bookings,
    label: item.period,
  }));

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
      {/* Period selector */}
      <SegmentedControl
        segments={[
          { value: "week" as const, label: t("admin.manage.periodWeek") },
          { value: "month" as const, label: t("admin.manage.periodMonth") },
          { value: "quarter" as const, label: t("admin.manage.periodQuarter") },
        ]}
        value={period}
        onValueChange={setPeriod}
      />

      {summaryQuery.isError ? (
        <ErrorState message={t("admin.manage.reportsError")} />
      ) : null}

      {/* 2x2 stat grid */}
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

      {/* Revenue section */}
      <YStack gap="$2">
        <SectionHeader title={t("admin.manage.monthlyRevenue")} />
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

      {/* Bookings chart */}
      <YStack gap="$2">
        <SectionHeader title={t("admin.manage.bookings")} />
        {bookingsQuery.isError ? (
          <ErrorState message={t("admin.manage.bookingsError")} />
        ) : null}
        {bookingsData.length > 0 ? (
          <GlassCard>
            <YStack height={220}>
              <CartesianChart
                data={bookingsData}
                xKey="x"
                yKeys={["y"]}
                domainPadding={{ left: 20, right: 20 }}
                axisOptions={{
                  labelColor: "rgba(255,255,255,0.5)",
                  lineColor: "rgba(255,255,255,0.08)",
                }}
              >
                {({ points, chartBounds }) => (
                  <Bar
                    points={points.y}
                    chartBounds={chartBounds}
                    color={ACCENT}
                    roundedCorners={{ topLeft: 4, topRight: 4 }}
                  />
                )}
              </CartesianChart>
            </YStack>
          </GlassCard>
        ) : !bookingsQuery.isLoading ? (
          <EmptyState title={t("admin.manage.bookingsEmpty")} />
        ) : null}
      </YStack>

      {/* Utilization with progress rings */}
      <YStack gap="$2">
        <SectionHeader title={t("admin.manage.utilization")} />
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
            <XStack items="center" gap="$4">
              <ProgressRing
                progress={item.utilization}
                size={56}
                strokeWidth={5}
              />
              <YStack flex={1} gap="$1">
                <Text fontWeight="600" color="$color">
                  {item.period}
                </Text>
                <Text fontSize="$2" color="$color10">
                  {item.totalBooked}/{item.totalCapacity} ({Math.round(item.utilization * 100)}%)
                </Text>
              </YStack>
            </XStack>
          </Card>
        ))}
      </YStack>
    </ScrollView>
  );
}
