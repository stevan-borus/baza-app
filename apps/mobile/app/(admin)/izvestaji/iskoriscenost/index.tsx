/**
 * Izveštaji → Iskorišćenost sub-page (P3-3).
 *
 * Anatomy: period pill, headline ProgressRing covering the whole period
 * window, a small trend line (same bucket sizes as the Prihod chart), a
 * 7×4 day-of-week × time-of-day heatmap, and three breakdown lists
 * (by Sala / by ClassType / by Trainer) all sorted busiest-first.
 *
 * Day-of-week origin: server returns 0=Sun..6=Sat (JS `getUTCDay`).
 * We render rows in Mon→Sun order to match Serbian week convention,
 * mapping each row to the right `dayOfWeek` index when reading the
 * heatmap cells. Time-of-day buckets are fixed: 06–11 / 11–15 / 15–19 /
 * 19–22. Sessions outside that range are dropped server-side.
 *
 * The trend line uses the same Pressable-View bar trick as the Prihod
 * chart — height ∝ utilization%. No third-party chart lib for what is
 * structurally a row of bars.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";
import { usePeriodPill, type Period } from "@/lib/admin/use-period-pill";

const BAR_HEIGHT_MAX = 90;
const BAR_HEIGHT_MIN = 4;

// Render order: Monday first (Serbian week convention).
// Each entry maps row position → server `dayOfWeek` (0=Sun..6=Sat).
const DOW_ROWS: ReadonlyArray<{ key: string; serverDow: number }> = [
  { key: "mon", serverDow: 1 },
  { key: "tue", serverDow: 2 },
  { key: "wed", serverDow: 3 },
  { key: "thu", serverDow: 4 },
  { key: "fri", serverDow: 5 },
  { key: "sat", serverDow: 6 },
  { key: "sun", serverDow: 0 },
];

const TIME_BUCKETS = ["morning", "midday", "afternoon", "evening"] as const;
type TimeBucket = (typeof TIME_BUCKETS)[number];

type HeatmapCell = {
  dayOfWeek: number;
  timeBucket: TimeBucket;
  booked: number;
  capacity: number;
  utilization: number;
};

function cellBackground(
  utilization: number,
  hasCapacity: boolean,
  accent: string,
  glassBorder: string,
): string {
  if (!hasCapacity) return glassBorder;
  // 4 tiers — keeps the heatmap legible without needing alpha math.
  // The accent already has a soft variant token, but for raw chips we
  // fade with explicit alpha so the green→bone gradient reads at a glance.
  if (utilization >= 0.75) return accent;
  if (utilization >= 0.5) return `${accent}b3`; // ~70%
  if (utilization >= 0.25) return `${accent}66`; // ~40%
  return `${accent}26`; // ~15%
}

export default function IzvestajiIskoriscenost() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const { period, setPeriod, window: periodWindow } = usePeriodPill("month");

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }

  const heatmapQuery = useQuery(
    reportsQueries.utilizationHeatmap({ ...periodWindow, period }),
  );
  const timeSeriesQuery = useQuery(
    reportsQueries.utilizationTimeSeries({ ...periodWindow, period }),
  );
  const byRoomQuery = useQuery(
    reportsQueries.utilizationByRoom({ ...periodWindow, period }),
  );
  const byClassTypeQuery = useQuery(
    reportsQueries.utilizationByClassType({ ...periodWindow, period }),
  );
  const byTrainerQuery = useQuery(
    reportsQueries.utilizationByTrainer({ ...periodWindow, period }),
  );

  const cells: HeatmapCell[] = useMemo(
    () => heatmapQuery.data?.cells ?? [],
    [heatmapQuery.data?.cells],
  );
  // Headline ring numbers — sum the whole heatmap so the ring covers the
  // full period window (not just today).
  const totalBooked = useMemo(
    () => cells.reduce((s, c) => s + c.booked, 0),
    [cells],
  );
  const totalCapacity = useMemo(
    () => cells.reduce((s, c) => s + c.capacity, 0),
    [cells],
  );
  const overallUtilization =
    totalCapacity > 0 ? totalBooked / totalCapacity : 0;

  // Look up a cell quickly by (dow, bucket).
  const cellLookup = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const c of cells) {
      map.set(`${c.dayOfWeek}:${c.timeBucket}`, c);
    }
    return map;
  }, [cells]);

  const trendBuckets = useMemo(
    () => timeSeriesQuery.data?.buckets ?? [],
    [timeSeriesQuery.data?.buckets],
  );

  const roomRows = useMemo(() => {
    const data = byRoomQuery.data?.data ?? [];
    return [...data].sort((a, b) => b.utilization - a.utilization);
  }, [byRoomQuery.data?.data]);
  const classTypeRows = useMemo(() => {
    const data = byClassTypeQuery.data?.data ?? [];
    return [...data].sort((a, b) => b.utilization - a.utilization);
  }, [byClassTypeQuery.data?.data]);
  const trainerRows = useMemo(() => {
    const data = byTrainerQuery.data?.data ?? [];
    return [...data].sort((a, b) => b.utilization - a.utilization);
  }, [byTrainerQuery.data?.data]);

  const dateLocale = i18n.language === "en" ? "en-US" : "sr-RS";
  const rangeLabel = useMemo(() => {
    if (!periodWindow.from || !periodWindow.to) {
      return t("admin.manage.periodAll");
    }
    const fromD = new Date(periodWindow.from);
    const toD = new Date(periodWindow.to);
    const inclusiveTo = new Date(toD.getTime() - 1);
    const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${fromD.toLocaleDateString(dateLocale, fmt)} – ${inclusiveTo.toLocaleDateString(dateLocale, fmt)}`;
  }, [periodWindow.from, periodWindow.to, dateLocale, t]);

  // Trend line — width budget identical to the Prihod chart so the two
  // sub-pages feel visually consistent.
  const chartWidth = Math.max(width - 24 * 2 - 20 * 2, 200);
  const barGap = 4;
  const bucketCount = Math.max(trendBuckets.length, 1);
  const barWidth = Math.max(
    (chartWidth - barGap * (bucketCount - 1)) / bucketCount,
    6,
  );

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.iskoriscenost.title")}
      rightSlot={<AvatarMenu />}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
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
          gap: 20,
        }}
      >
        {/* Period pill — drives every query. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <SegmentedControl
            options={[
              { value: "week" as Period, label: t("admin.manage.periodWeek") },
              { value: "month" as Period, label: t("admin.manage.periodMonth") },
              { value: "quarter" as Period, label: t("admin.manage.periodQuarter") },
              { value: "year" as Period, label: t("admin.manage.periodYear") },
              { value: "all" as Period, label: t("admin.manage.periodAll") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </MotiView>

        {/* Headline ring. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 60 }}
        >
          <View className="flex-row items-center" style={{ gap: 20 }}>
            <ProgressRing
              progress={overallUtilization}
              size={120}
              strokeWidth={10}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <CapsLabel size={11} tracking={1.6} className="text-muted">
                {t("admin.izvestaji.iskoriscenost.headline")}
              </CapsLabel>
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 13 }}
              >
                {t("admin.izvestaji.iskoriscenost.summary", {
                  booked: totalBooked,
                  capacity: totalCapacity,
                })}
              </Text>
              <Text className="text-muted" style={{ fontSize: 12 }}>
                {rangeLabel}
              </Text>
            </View>
          </View>
        </MotiView>

        {/* Trend line. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.iskoriscenost.trend.title")}
            </CapsLabel>

            {timeSeriesQuery.isLoading ? (
              <View style={{ paddingTop: 16 }}>
                <SkeletonCard />
              </View>
            ) : null}
            {timeSeriesQuery.isError ? (
              <ErrorState message={t("admin.manage.reportsError")} />
            ) : null}
            {!timeSeriesQuery.isLoading &&
            !timeSeriesQuery.isError &&
            trendBuckets.length > 0 ? (
              <View style={{ paddingTop: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    height: BAR_HEIGHT_MAX + 4,
                    gap: barGap,
                  }}
                >
                  {trendBuckets.map((b, idx) => {
                    const h =
                      b.capacity === 0
                        ? BAR_HEIGHT_MIN
                        : Math.max(
                            BAR_HEIGHT_MIN,
                            b.utilization * BAR_HEIGHT_MAX,
                          );
                    return (
                      <View
                        key={b.bucketStart}
                        testID={`iskoriscenost-trend-${idx}`}
                        accessibilityLabel={`${Math.round(b.utilization * 100)}%`}
                        style={{
                          width: barWidth,
                          height: h,
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                          backgroundColor:
                            b.capacity > 0 ? tokens.accent : tokens.glassBorder,
                        }}
                      />
                    );
                  })}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingTop: 8,
                  }}
                >
                  {[0, Math.floor(trendBuckets.length / 2), trendBuckets.length - 1]
                    .filter((v, i, arr) => arr.indexOf(v) === i && v >= 0)
                    .map((idx) => (
                      <Text
                        key={idx}
                        className="text-muted"
                        style={{ fontSize: 10 }}
                      >
                        {new Date(trendBuckets[idx].bucketStart).toLocaleDateString(
                          dateLocale,
                          { day: "numeric", month: "short" },
                        )}
                      </Text>
                    ))}
                </View>
              </View>
            ) : null}
            {!timeSeriesQuery.isLoading &&
            !timeSeriesQuery.isError &&
            trendBuckets.length === 0 ? (
              <View style={{ paddingTop: 12 }}>
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.iskoriscenost.noData")}
                </Text>
              </View>
            ) : null}
          </GlassCard>
        </MotiView>

        {/* Heatmap. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 180 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.iskoriscenost.heatmap.title")}
            </CapsLabel>

            {heatmapQuery.isLoading ? (
              <View style={{ paddingTop: 16 }}>
                <SkeletonCard />
              </View>
            ) : null}
            {heatmapQuery.isError ? (
              <ErrorState message={t("admin.manage.reportsError")} />
            ) : null}
            {!heatmapQuery.isLoading && !heatmapQuery.isError ? (
              <View style={{ paddingTop: 14, gap: 4 }}>
                {/* Header row: time-bucket labels. */}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 32 }} />
                  {TIME_BUCKETS.map((b) => (
                    <View
                      key={b}
                      style={{
                        flex: 1,
                        marginLeft: 4,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        className="text-muted"
                        style={{ fontSize: 9, textAlign: "center" }}
                        numberOfLines={1}
                      >
                        {t(`admin.izvestaji.iskoriscenost.heatmap.${b}`)}
                      </Text>
                    </View>
                  ))}
                </View>
                {DOW_ROWS.map((row) => (
                  <View
                    key={row.key}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Text
                      className="text-muted"
                      style={{ width: 32, fontSize: 10 }}
                      numberOfLines={1}
                    >
                      {t(`admin.izvestaji.iskoriscenost.dayShort.${row.key}`)}
                    </Text>
                    {TIME_BUCKETS.map((b) => {
                      const cell = cellLookup.get(`${row.serverDow}:${b}`);
                      const utilization = cell?.utilization ?? 0;
                      const hasCapacity = (cell?.capacity ?? 0) > 0;
                      const pct = Math.round(utilization * 100);
                      return (
                        <View
                          key={b}
                          testID={`iskoriscenost-heatmap-${row.key}-${b}`}
                          style={{
                            flex: 1,
                            marginLeft: 4,
                            height: 32,
                            borderRadius: 6,
                            backgroundColor: cellBackground(
                              utilization,
                              hasCapacity,
                              tokens.accent,
                              tokens.glassBorder,
                            ),
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          accessibilityLabel={`${row.key} ${b} ${pct}%`}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontFamily: "AlbertSans-SemiBold",
                              color:
                                hasCapacity && utilization >= 0.5
                                  ? "#FBF7EC"
                                  : tokens.foreground,
                            }}
                          >
                            {hasCapacity ? `${pct}%` : "–"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}
          </GlassCard>
        </MotiView>

        {/* Breakdown: by Sala. */}
        <BreakdownSection
          titleKey="admin.izvestaji.iskoriscenost.bySala"
          loading={byRoomQuery.isLoading}
          error={byRoomQuery.isError}
          rows={roomRows.map((r) => ({
            id: r.roomId,
            name: r.roomName,
            booked: r.totalBooked,
            capacity: r.totalCapacity,
            utilization: r.utilization,
          }))}
          accent={tokens.accent}
          glassBorder={tokens.glassBorder}
          delay={240}
        />

        {/* Breakdown: by ClassType. */}
        <BreakdownSection
          titleKey="admin.izvestaji.iskoriscenost.byClassType"
          loading={byClassTypeQuery.isLoading}
          error={byClassTypeQuery.isError}
          rows={classTypeRows.map((r) => ({
            id: r.classTypeId,
            name: r.name,
            booked: r.totalBooked,
            capacity: r.totalCapacity,
            utilization: r.utilization,
          }))}
          accent={tokens.accent}
          glassBorder={tokens.glassBorder}
          delay={300}
        />

        {/* Breakdown: by Trainer. */}
        <BreakdownSection
          titleKey="admin.izvestaji.iskoriscenost.byTrainer"
          loading={byTrainerQuery.isLoading}
          error={byTrainerQuery.isError}
          rows={trainerRows.map((r) => ({
            id: r.trainerUserId,
            name: r.trainerName,
            booked: r.totalBooked,
            capacity: r.totalCapacity,
            utilization: r.utilization,
          }))}
          accent={tokens.accent}
          glassBorder={tokens.glassBorder}
          delay={360}
        />
      </ScrollView>
    </ScreenContainerRaw>
  );
}

type BreakdownRow = {
  id: string;
  name: string;
  booked: number;
  capacity: number;
  utilization: number;
};

type BreakdownSectionProps = {
  titleKey: string;
  loading: boolean;
  error: boolean;
  rows: BreakdownRow[];
  accent: string;
  glassBorder: string;
  delay: number;
};

function BreakdownSection({
  titleKey,
  loading,
  error,
  rows,
  accent,
  glassBorder,
  delay,
}: BreakdownSectionProps) {
  const { t } = useTranslation();
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 350, delay }}
    >
      <GlassCard size="lg">
        <CapsLabel size={10} tracking={1.4} className="text-muted">
          {t(titleKey)}
        </CapsLabel>
        <View style={{ paddingTop: 12, gap: 10 }}>
          {loading ? <SkeletonCard /> : null}
          {error ? (
            <ErrorState message={t("admin.manage.reportsError")} />
          ) : null}
          {!loading && !error && rows.length === 0 ? (
            <Text className="text-muted" style={{ fontSize: 13 }}>
              {t("admin.izvestaji.iskoriscenost.noData")}
            </Text>
          ) : null}
          {rows.map((row) => {
            const pct = Math.round(row.utilization * 100);
            return (
              <View key={row.id} style={{ gap: 4 }}>
                <View className="flex-row justify-between items-baseline">
                  <Text
                    className="text-foreground font-body-semibold"
                    style={{ fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 14 }}
                  >
                    {`${pct}%`}
                  </Text>
                </View>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: glassBorder,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      height: "100%",
                      backgroundColor: accent,
                    }}
                  />
                </View>
                <Text className="text-muted" style={{ fontSize: 11 }}>
                  {`${row.booked} / ${row.capacity}`}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassCard>
    </MotiView>
  );
}
