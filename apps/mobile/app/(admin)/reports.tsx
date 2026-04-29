/**
 * Admin Reports screen — redesigned for Phase 2 new-ui branch
 * Design inspiration:
 *   - Stripe Dashboard iOS Jun 2023: chart + metric pairing
 *   - WHOOP iOS Apr 2024: ring + metric combos, insights layout
 *   - Apple Fitness iOS Feb 2026: ring as summary
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { CartesianChart, Bar } from "victory-native";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroCard } from "@/components/ui/hero-card";
import { StatTile } from "@/components/ui/stat-tile";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SectionLabel } from "@/components/ui/typography";
import { ACCENT } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";

type Period = "week" | "month" | "quarter";

const STAGGER = [0, 80, 160, 240, 320];

export default function AdminReports() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("month");

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

  // Derive max bookings for proportional bars in popular classes section
  const maxBookings =
    bookingsData.length > 0
      ? Math.max(...bookingsData.map((d) => d.y))
      : 1;

  // Utilization data for trainer rows
  const utilizationData = utilizationQuery.data?.data ?? [];
  const maxUtilization =
    utilizationData.length > 0
      ? Math.max(...utilizationData.map((u) => u.utilization))
      : 1;

  return (
    <ScreenContainerRaw title={t("admin.manage.tabReports")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2e5b42"
            colors={["#2e5b42"]}
          />
        }
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 24,
          paddingBottom: bottomPad,
          gap: 24,
        }}
      >
      {/* Period selector */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: STAGGER[0] }}
      >
        <SegmentedControl
          options={[
            { value: "week" as const, label: t("admin.manage.periodWeek") },
            { value: "month" as const, label: t("admin.manage.periodMonth") },
            { value: "quarter" as const, label: t("admin.manage.periodQuarter") },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </MotiView>

      {summaryQuery.isError ? (
        <ErrorState message={t("admin.manage.reportsError")} />
      ) : null}

      {/* 2×2 StatTile grid */}
      {summary ? (
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: STAGGER[1] }}
        >
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <StatTile
                  label={t("admin.manage.totalSessions")}
                  value={summary.totalSessions}
                />
              </View>
              <View style={{ flex: 1 }}>
                <StatTile
                  label={t("admin.dashboard.activeClients")}
                  value={summary.activeClients}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <StatTile
                  label={t("admin.manage.totalClients")}
                  value={summary.totalClients}
                />
              </View>
              <View style={{ flex: 1 }}>
                <StatTile
                  label={t("admin.dashboard.revenue")}
                  value={summary.revenue}
                />
              </View>
            </View>
          </View>
        </MotiView>
      ) : null}

      {/* Hero chart: Attendance / Bookings */}
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: STAGGER[2] }}
      >
        <View style={{ gap: 10 }}>
          <SectionLabel>{t("admin.manage.bookings")}</SectionLabel>
          {bookingsQuery.isError ? (
            <ErrorState message={t("admin.manage.bookingsError")} />
          ) : null}
          {bookingsData.length > 0 ? (
            <HeroCard tone="accent">
              <View style={{ height: 220 }}>
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
              </View>
            </HeroCard>
          ) : !bookingsQuery.isLoading ? (
            <EmptyState title={t("admin.manage.bookingsEmpty")} />
          ) : null}
        </View>
      </MotiView>

      {/* Popular classes — ranked list with horizontal bars */}
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: STAGGER[3] }}
      >
        <View style={{ gap: 10 }}>
          <SectionLabel>{t("admin.manage.monthlyRevenue")}</SectionLabel>
          {revenueQuery.isError ? (
            <ErrorState message={t("admin.manage.revenueError")} />
          ) : null}
          {!revenueQuery.isError &&
          !revenueQuery.isLoading &&
          (revenueQuery.data?.data ?? []).length === 0 ? (
            <EmptyState title={t("admin.manage.revenueEmpty")} />
          ) : null}
          {(revenueQuery.data?.data ?? []).map((item, index) => {
            const maxRevenue = Math.max(
              ...(revenueQuery.data?.data ?? []).map((d) => d.revenue),
              1,
            );
            const fillRatio = item.revenue / maxRevenue;
            return (
              <GlassCard key={item.period} size="md">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  {/* Rank number */}
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: "rgba(255,255,255,0.12)",
                      width: 36,
                      textAlign: "center",
                      lineHeight: 32,
                    }}
                  >
                    {index + 1}
                  </Text>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14 }}
                      >
                        {item.period}
                      </Text>
                      <Text
                        className="text-accent font-body-semibold"
                        style={{ fontSize: 13 }}
                      >
                        {item.revenue} RSD
                      </Text>
                    </View>
                    {/* Proportional bar */}
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: ACCENT,
                          width: `${Math.round(fillRatio * 100)}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>
              </GlassCard>
            );
          })}
        </View>
      </MotiView>

      {/* Trainer utilization — glass rows with ProgressRing + fill bar */}
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: STAGGER[4] }}
      >
        <View style={{ gap: 10 }}>
          <SectionLabel>{t("admin.manage.utilization")}</SectionLabel>
          {utilizationQuery.isError ? (
            <ErrorState message={t("admin.manage.utilizationError")} />
          ) : null}
          {!utilizationQuery.isError &&
          !utilizationQuery.isLoading &&
          utilizationData.length === 0 ? (
            <EmptyState title={t("admin.manage.utilizationEmpty")} />
          ) : null}
          {utilizationData.map((item) => (
            <GlassCard key={item.period} size="md">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <ProgressRing
                  progress={item.utilization}
                  size={52}
                  strokeWidth={5}
                />
                <View style={{ flex: 1, gap: 5 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      className="text-foreground font-body-semibold"
                      style={{ fontSize: 14 }}
                    >
                      {item.period}
                    </Text>
                    <Text
                      className="text-muted"
                      style={{ fontSize: 13 }}
                    >
                      {item.totalBooked}/{item.totalCapacity}
                    </Text>
                  </View>
                  {/* Fill rate bar */}
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: ACCENT,
                        width: `${Math.round(
                          (item.utilization / maxUtilization) * 100,
                        )}%`,
                      }}
                    />
                  </View>
                </View>
              </View>
            </GlassCard>
          ))}
        </View>
      </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
