/**
 * Izveštaji → Prihod sub-page (P3-2).
 *
 * Anatomy: period pill, headline revenue rollup, bucketed bar chart, two
 * breakdown lists (by-package-type, by-payment-method), and a recent
 * payments list. Tapping a chart bar — or a recent-payment row — drills into
 * Naplata pre-filtered to that bucket's window, carrying a `returnTo` query
 * so Naplata renders the "← Nazad u Izveštaji" pill on arrival (ADR-0005).
 *
 * The chart uses plain Pressable Views with proportional heights. We don't
 * pull in a third-party chart lib for what is structurally a row of bars —
 * the visual is intentionally quiet and matches the studio palette.
 */
import { useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { NumberRollup } from "@/components/ui/number-rollup";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { billingQueries } from "@/lib/queries/billing-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { usePeriodPill, type Period } from "@/lib/admin/use-period-pill";
import { encodeReturnTo } from "@/lib/admin/return-to";

const BAR_HEIGHT_MAX = 110;
const BAR_HEIGHT_MIN = 4;
const RETURN_TO_PATH = "/(admin)/izvestaji/prihod";

const methodLabelKeys: Record<string, string> = {
  CASH: "admin.manage.methodCash",
  CARD: "admin.manage.methodCard",
  COMPANY: "admin.manage.methodCompany",
  QR: "admin.manage.methodQr",
  MANUAL_ONLINE: "admin.manage.methodOnline",
};

function formatRsd(n: number): string {
  return `${Math.round(n).toLocaleString("sr-RS")} RSD`;
}

export default function IzvestajiPrihod() {
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

  const timeSeriesQuery = useQuery(
    reportsQueries.revenueTimeSeries({ ...periodWindow, period }),
  );
  const byPackageQuery = useQuery(reportsQueries.revenueByPackageType(periodWindow));
  const byMethodQuery = useQuery(reportsQueries.revenueByMethod(periodWindow));
  // Recent payments: reuse the existing infinite list, take first page only.
  const recentPaymentsQuery = useInfiniteQuery(
    billingQueries.listInfinite({}),
  );

  // Reach into query data inside useMemo so the deps are query.data (cached
  // reference) rather than a fresh `?? []` array per render — keeps the
  // memos stable and silences exhaustive-deps.
  const buckets = useMemo(
    () => timeSeriesQuery.data?.buckets ?? [],
    [timeSeriesQuery.data?.buckets],
  );
  const totalRevenue = useMemo(
    () => buckets.reduce((s, b) => s + b.revenue, 0),
    [buckets],
  );
  const maxBucketRevenue = useMemo(
    () => buckets.reduce((m, b) => (b.revenue > m ? b.revenue : m), 0),
    [buckets],
  );

  const packageRows = useMemo(
    () => byPackageQuery.data?.rows ?? [],
    [byPackageQuery.data?.rows],
  );
  const packageTotal = useMemo(
    () => packageRows.reduce((s, r) => s + r.revenue, 0),
    [packageRows],
  );
  const methodRows = useMemo(
    () => byMethodQuery.data?.rows ?? [],
    [byMethodQuery.data?.rows],
  );
  const methodTotal = useMemo(
    () => methodRows.reduce((s, r) => s + r.revenue, 0),
    [methodRows],
  );

  const recentPayments = (
    recentPaymentsQuery.data?.pages[0]?.records ?? []
  ).slice(0, 8);

  const dateLocale = i18n.language === "en" ? "en-US" : "sr-RS";
  const rangeLabel = useMemo(() => {
    if (!periodWindow.from || !periodWindow.to) {
      return t("admin.manage.periodAll");
    }
    const fromD = new Date(periodWindow.from);
    const toD = new Date(periodWindow.to);
    // toD is exclusive — display the last calendar day.
    const inclusiveTo = new Date(toD.getTime() - 1);
    const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${fromD.toLocaleDateString(dateLocale, fmt)} – ${inclusiveTo.toLocaleDateString(dateLocale, fmt)}`;
  }, [periodWindow.from, periodWindow.to, dateLocale, t]);

  // Width budget for the bar chart row — full screen minus 24px page padding
  // either side, minus the card's 20px inner padding either side.
  const chartWidth = Math.max(width - 24 * 2 - 20 * 2, 200);
  const barGap = 4;
  const bucketCount = Math.max(buckets.length, 1);
  const barWidth = Math.max((chartWidth - barGap * (bucketCount - 1)) / bucketCount, 6);

  function drillToBucket(bucketStart: string, bucketEnd: string) {
    router.push({
      pathname: "/(admin)/naplata",
      params: {
        from: bucketStart,
        to: bucketEnd,
        returnTo: encodeReturnTo(RETURN_TO_PATH),
      },
    });
  }

  function drillToRecent() {
    router.push({
      pathname: "/(admin)/naplata",
      params: { returnTo: encodeReturnTo(RETURN_TO_PATH) },
    });
  }

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.prihod.title")}
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
        {/* Period pill — drives every query on the page. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <SegmentedControl
            options={[
              { value: "month" as Period, label: t("admin.manage.periodMonth") },
              { value: "quarter" as Period, label: t("admin.manage.periodQuarter") },
              { value: "year" as Period, label: t("admin.manage.periodYear") },
              { value: "all" as Period, label: t("admin.manage.periodAll") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </MotiView>

        {/* Headline revenue. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 60 }}
        >
          <View className="gap-1.5">
            <CapsLabel size={11} tracking={1.6} className="text-muted">
              {t("admin.izvestaji.prihod.headline")}
            </CapsLabel>
            <View className="flex-row items-baseline">
              <NumberRollup
                value={totalRevenue}
                formatter={(n) => Math.round(n).toLocaleString("sr-RS")}
                className="text-foreground font-body-bold"
                style={{ fontSize: 40, letterSpacing: -1, lineHeight: 44 }}
              />
              <Text
                className="text-muted ml-2"
                style={{ fontFamily: "AlbertSans-Medium", fontSize: 14 }}
              >
                RSD
              </Text>
            </View>
            <Text className="text-muted" style={{ fontSize: 12 }}>
              {rangeLabel}
            </Text>
          </View>
        </MotiView>

        {/* Chart card. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.prihod.chart.title")}
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
            buckets.length > 0 ? (
              <View style={{ paddingTop: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    height: BAR_HEIGHT_MAX + 4,
                    gap: barGap,
                  }}
                >
                  {buckets.map((b, idx) => {
                    const ratio =
                      maxBucketRevenue > 0 ? b.revenue / maxBucketRevenue : 0;
                    const h =
                      b.revenue === 0
                        ? BAR_HEIGHT_MIN
                        : Math.max(BAR_HEIGHT_MIN, ratio * BAR_HEIGHT_MAX);
                    return (
                      <Pressable
                        key={b.bucketStart}
                        testID={`prihod-bar-${idx}`}
                        onPress={() => drillToBucket(b.bucketStart, b.bucketEnd)}
                        hitSlop={6}
                        android_ripple={null}
                        accessibilityLabel={`${formatRsd(b.revenue)} ${new Date(
                          b.bucketStart,
                        ).toLocaleDateString(dateLocale, {
                          day: "numeric",
                          month: "short",
                        })}`}
                        style={{
                          width: barWidth,
                          height: h,
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                          backgroundColor:
                            b.revenue > 0 ? tokens.accent : tokens.glassBorder,
                        }}
                      />
                    );
                  })}
                </View>
                {/* X-axis bucket labels — render first, middle and last only
                    to keep the row legible at 30+ buckets. */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingTop: 8,
                  }}
                >
                  {[0, Math.floor(buckets.length / 2), buckets.length - 1]
                    .filter((v, i, arr) => arr.indexOf(v) === i && v >= 0)
                    .map((idx) => (
                      <Text
                        key={idx}
                        className="text-muted"
                        style={{ fontSize: 10 }}
                      >
                        {new Date(buckets[idx].bucketStart).toLocaleDateString(
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
            buckets.length === 0 ? (
              <View style={{ paddingTop: 12 }}>
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.prihod.noData")}
                </Text>
              </View>
            ) : null}
          </GlassCard>
        </MotiView>

        {/* By package type. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 180 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.prihod.byPackageType")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 10 }}>
              {byPackageQuery.isLoading ? <SkeletonCard /> : null}
              {byPackageQuery.isError ? (
                <ErrorState message={t("admin.manage.reportsError")} />
              ) : null}
              {!byPackageQuery.isLoading &&
              !byPackageQuery.isError &&
              packageRows.length === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.prihod.noData")}
                </Text>
              ) : null}
              {packageRows.map((row) => {
                const pct = packageTotal > 0 ? row.revenue / packageTotal : 0;
                return (
                  <View key={row.packageTypeId} style={{ gap: 4 }}>
                    <View className="flex-row justify-between items-baseline">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {row.packageTypeName}
                      </Text>
                      <Text
                        className="text-foreground font-body-bold"
                        style={{ fontSize: 14 }}
                      >
                        {formatRsd(row.revenue)}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: tokens.glassBorder,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.round(pct * 100)}%`,
                          height: "100%",
                          backgroundColor: tokens.accent,
                        }}
                      />
                    </View>
                    <Text className="text-muted" style={{ fontSize: 11 }}>
                      {t("admin.izvestaji.prihod.paymentsCount", {
                        count: row.paymentCount,
                      })}
                      {packageTotal > 0
                        ? ` · ${Math.round(pct * 100)}%`
                        : ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          </GlassCard>
        </MotiView>

        {/* By payment method. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.prihod.byMethod")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 10 }}>
              {byMethodQuery.isLoading ? <SkeletonCard /> : null}
              {byMethodQuery.isError ? (
                <ErrorState message={t("admin.manage.reportsError")} />
              ) : null}
              {!byMethodQuery.isLoading &&
              !byMethodQuery.isError &&
              methodRows.length === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.prihod.noData")}
                </Text>
              ) : null}
              {methodRows.map((row) => {
                const pct = methodTotal > 0 ? row.revenue / methodTotal : 0;
                const label = methodLabelKeys[row.method]
                  ? t(methodLabelKeys[row.method])
                  : row.method;
                return (
                  <View key={row.method} style={{ gap: 4 }}>
                    <View className="flex-row justify-between items-baseline">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text
                        className="text-foreground font-body-bold"
                        style={{ fontSize: 14 }}
                      >
                        {formatRsd(row.revenue)}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: tokens.glassBorder,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.round(pct * 100)}%`,
                          height: "100%",
                          backgroundColor: tokens.accent,
                        }}
                      />
                    </View>
                    <Text className="text-muted" style={{ fontSize: 11 }}>
                      {t("admin.izvestaji.prihod.paymentsCount", {
                        count: row.paymentCount,
                      })}
                      {methodTotal > 0
                        ? ` · ${Math.round(pct * 100)}%`
                        : ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          </GlassCard>
        </MotiView>

        {/* Recent payments. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 300 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.prihod.recentPayments")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 8 }}>
              {recentPaymentsQuery.isLoading ? <SkeletonCard /> : null}
              {recentPaymentsQuery.isError ? (
                <ErrorState message={t("admin.manage.billingError")} />
              ) : null}
              {!recentPaymentsQuery.isLoading &&
              !recentPaymentsQuery.isError &&
              recentPayments.length === 0 ? (
                <EmptyState title={t("admin.manage.billingEmpty")} />
              ) : null}
              {recentPayments.map((p) => (
                <Pressable
                  key={p.id}
                  testID={`prihod-recent-${p.id}`}
                  onPress={drillToRecent}
                  android_ripple={null}
                  className="active:opacity-70"
                  style={{
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: tokens.glassBorder,
                  }}
                >
                  <View className="flex-row justify-between items-center">
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {formatRsd(p.amount)}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {methodLabelKeys[p.method]
                          ? t(methodLabelKeys[p.method])
                          : p.method}
                      </Text>
                    </View>
                    <Text className="text-muted" style={{ fontSize: 11 }}>
                      {new Date(p.createdAt).toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
