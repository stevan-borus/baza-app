/**
 * Admin Reports screen — redesigned for Phase 2 new-ui branch
 * Design inspiration:
 *   - Stripe Dashboard iOS Jun 2023: chart + metric pairing
 *   - WHOOP iOS Apr 2024: ring + metric combos, insights layout
 *   - Apple Fitness iOS Feb 2026: ring as summary
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { CartesianChart, Bar } from "victory-native";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroCard } from "@/components/ui/hero-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { StatStrip } from "@/components/ui/studio";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";
import dayjs from "dayjs";

type Period = "week" | "month" | "quarter" | "year";

const STAGGER = [0, 80, 160, 240, 320, 400];

function formatBucketLabel(period: string, lang: string) {
  // Month buckets: "YYYY-MM" → "May 2026"
  if (/^\d{4}-\d{2}$/.test(period)) {
    return dayjs(`${period}-01`).locale(lang).format("MMMM YYYY");
  }
  // Week buckets: "YYYY-Www" → "W19 · 2026"
  if (/^\d{4}-W\d{2}$/.test(period)) {
    const [year, week] = period.split("-W");
    return `${week} · ${year}`;
  }
  // Day buckets: "YYYY-MM-DD" → "May 7"
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return dayjs(period).locale(lang).format("D. MMM");
  }
  return period;
}

export default function AdminReports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("month");

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }

  // Derive a from/to window from the period pill so each pill shows a distinct
  // time range. The server-side parser only accepts "day" | "week" | "month";
  // we pick the bucket granularity that produces the right number of points
  // per pill (week → daily ticks, month → weekly, quarter+year → monthly).
  //
  // useMemo + a stable `to` (anchored to the start of the current day in UTC)
  // is critical: without it `new Date().toISOString()` differs every render
  // by milliseconds, the queryKey changes, the query refetches, and the cycle
  // never settles — the dev server logs hundreds of identical requests/sec.
  const periodWindow = useMemo(() => {
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    if (period === "week") {
      from.setUTCDate(to.getUTCDate() - 7);
      return { from: from.toISOString(), to: to.toISOString(), bucket: "day" };
    }
    if (period === "month") {
      from.setUTCDate(to.getUTCDate() - 30);
      return { from: from.toISOString(), to: to.toISOString(), bucket: "week" };
    }
    if (period === "year") {
      from.setUTCFullYear(to.getUTCFullYear() - 1);
      return { from: from.toISOString(), to: to.toISOString(), bucket: "month" };
    }
    // quarter
    from.setUTCDate(to.getUTCDate() - 90);
    return { from: from.toISOString(), to: to.toISOString(), bucket: "month" };
  }, [period]);

  const summaryQuery = useQuery(
    reportsQueries.summary({
      from: periodWindow.from,
      to: periodWindow.to,
    }),
  );
  const revenueQuery = useQuery(
    reportsQueries.revenue({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const utilizationQuery = useQuery(
    reportsQueries.utilization({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const bookingsQuery = useQuery(
    reportsQueries.bookings({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const packagesQuery = useQuery(
    reportsQueries.packages({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const utilizationByRoomQuery = useQuery(
    reportsQueries.utilizationByRoom({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const utilizationByClassTypeQuery = useQuery(
    reportsQueries.utilizationByClassType({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
  const utilizationByTrainerQuery = useQuery(
    reportsQueries.utilizationByTrainer({
      from: periodWindow.from,
      to: periodWindow.to,
      period: periodWindow.bucket,
    }),
  );
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
    <ScreenContainerRaw title={t("admin.manage.tabReports")} rightSlot={<AvatarMenu />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
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
            { value: "year" as const, label: t("admin.manage.periodYear") },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </MotiView>

      {summaryQuery.isError ? (
        <ErrorState message={t("admin.manage.reportsError")} />
      ) : null}

      {/* Editorial stat strip — 4 hairline-separated columns */}
      {summary ? (
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: STAGGER[1] }}
        >
          <StatStrip
            className=""
            columns={2}
            items={[
              {
                label: t("admin.manage.totalSessions"),
                value: summary.totalSessions,
              },
              {
                label: t("admin.dashboard.activeClients"),
                value: summary.activeClients,
              },
              {
                label: t("admin.manage.totalClients"),
                value: summary.totalClients,
              },
              {
                label: t("admin.dashboard.revenue"),
                value: summary.revenue,
                accent: true,
              },
            ]}
          />
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
          ) : bookingsQuery.isLoading ? (
            <SkeletonCard />
          ) : bookingsData.some((d) => d.y > 0) ? (
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
                      color={tokens.accent}
                      roundedCorners={{ topLeft: 4, topRight: 4 }}
                    />
                  )}
                </CartesianChart>
              </View>
            </HeroCard>
          ) : (
            <EmptyState title={t("admin.manage.bookingsEmpty")} />
          )}
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
          ) : revenueQuery.isLoading ? (
            <SkeletonCard />
          ) : (revenueQuery.data?.data ?? []).length === 0 ? (
            <EmptyState title={t("admin.manage.revenueEmpty")} />
          ) : null}
          {(revenueQuery.data?.data ?? []).map((item, index) => {
            const maxRevenue = Math.max(
              ...(revenueQuery.data?.data ?? []).map((d) => d.revenue),
              1,
            );
            const fillRatio = item.revenue / maxRevenue;
            return (
              <GlassCard
                key={item.period}
                testID={`revenue-row-${item.period}`}
                size="md"
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  {/* Rank number */}
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: tokens.muted,
                      opacity: 0.35,
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
                        {formatBucketLabel(item.period, lang)}
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
                        backgroundColor: tokens.glassStrong,
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: tokens.accent,
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
          ) : utilizationQuery.isLoading ? (
            <SkeletonCard />
          ) : utilizationData.length === 0 ? (
            <EmptyState title={t("admin.manage.utilizationEmpty")} />
          ) : null}
          {utilizationData.map((item) => (
            <GlassCard
              key={item.period}
              testID={`utilization-row-${item.period}`}
              size="md"
            >
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
                      {formatBucketLabel(item.period, lang)}
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
                        backgroundColor: tokens.accent,
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

          {/* Per-Sala drilldown */}
          {(utilizationByRoomQuery.data?.data ?? []).length > 0 ? (
            <UtilizationDrilldown
              caption={t("admin.manage.utilizationByRoom")}
              tokens={tokens}
              rows={(utilizationByRoomQuery.data?.data ?? []).map((row) => ({
                key: row.roomId,
                testID: `utilization-by-room-row-${row.roomId}`,
                name: row.roomName,
                booked: row.totalBooked,
                capacity: row.totalCapacity,
                utilization: row.utilization,
              }))}
            />
          ) : null}

          {/* Per-ClassType drilldown */}
          {(utilizationByClassTypeQuery.data?.data ?? []).length > 0 ? (
            <UtilizationDrilldown
              caption={t("admin.manage.utilizationByClassType")}
              tokens={tokens}
              rows={(utilizationByClassTypeQuery.data?.data ?? []).map((row) => ({
                key: row.classTypeId,
                testID: `utilization-by-class-type-row-${row.classTypeId}`,
                name: row.name,
                booked: row.totalBooked,
                capacity: row.totalCapacity,
                utilization: row.utilization,
              }))}
            />
          ) : null}

          {/* Per-Trainer drilldown */}
          {(utilizationByTrainerQuery.data?.data ?? []).length > 0 ? (
            <UtilizationDrilldown
              caption={t("admin.manage.utilizationByTrainer")}
              tokens={tokens}
              rows={(utilizationByTrainerQuery.data?.data ?? []).map((row) => ({
                key: row.trainerUserId,
                testID: `utilization-by-trainer-row-${row.trainerUserId}`,
                name: row.trainerName,
                booked: row.totalBooked,
                capacity: row.totalCapacity,
                utilization: row.utilization,
              }))}
            />
          ) : null}
        </View>
      </MotiView>

      {/* Packages — most-used, revenue per type, comp vs paid */}
      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: STAGGER[5] }}
      >
        <View style={{ gap: 10 }}>
          <SectionLabel>{t("admin.manage.packagesSection")}</SectionLabel>
          {packagesQuery.isError ? (
            <ErrorState message={t("admin.manage.packagesReportError")} />
          ) : packagesQuery.isLoading ? (
            <SkeletonCard />
          ) : (packagesQuery.data?.mostUsed.length ?? 0) === 0 ? (
            <EmptyState title={t("admin.manage.packagesReportEmpty")} />
          ) : null}
          {(packagesQuery.data?.mostUsed ?? []).slice(0, 5).map((item, index) => {
            const max = packagesQuery.data?.mostUsed[0]?.count ?? 1;
            const fillRatio = item.count / max;
            return (
              <GlassCard
                key={item.packageTypeId}
                testID={`packages-most-used-row-${item.packageTypeId}`}
                size="md"
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: tokens.muted,
                      opacity: 0.35,
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
                        {item.name}
                      </Text>
                      <Text
                        className="text-accent font-body-semibold"
                        style={{ fontSize: 13 }}
                      >
                        {t("admin.manage.packagesCount", { count: item.count })}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: tokens.glassStrong,
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: tokens.accent,
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
      </ScrollView>
    </ScreenContainerRaw>
  );
}

type DrilldownRow = {
  key: string;
  testID: string;
  name: string;
  booked: number;
  capacity: number;
  utilization: number;
};

function UtilizationDrilldown({
  caption,
  tokens,
  rows,
}: {
  caption: string;
  tokens: ReturnType<typeof useThemeTokens>;
  rows: DrilldownRow[];
}) {
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text
        className="text-muted"
        style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" }}
      >
        {caption}
      </Text>
      {rows.map((row) => (
        <GlassCard key={row.key} testID={row.testID} size="md">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <ProgressRing progress={row.utilization} size={44} strokeWidth={4} />
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
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {row.booked}/{row.capacity}
                </Text>
              </View>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.glassStrong,
                }}
              >
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: tokens.accent,
                    width: `${Math.round(row.utilization * 100)}%`,
                  }}
                />
              </View>
            </View>
          </View>
        </GlassCard>
      ))}
    </View>
  );
}
