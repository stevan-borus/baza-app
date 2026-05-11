/**
 * Izveštaji → Rezervacije sub-page (P3-4).
 *
 * Anatomy: period pill, 2×2 headline tiles, a stacked cancel-breakdown bar
 * (pre-cutoff vs late by `lateCancelHours`), a period-bucketed bookings
 * chart, and a top-10 sessions list. Tapping a top-session row drills into
 * the existing session detail page with a `returnTo` so the destination
 * can offer a Nazad pill.
 *
 * All four chunks come from a single `/api/reports/bookings/detail` call —
 * one query keeps the four tiles consistent (a show-rate computed from one
 * window while the chart uses a slightly different one is the kind of thing
 * users notice immediately).
 *
 * The cancel breakdown chooses NOT to be tappable for now — there's no
 * obvious drill target ("show me the canceled bookings filtered by late?").
 * If a target emerges later it slots in here.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { NumberRollup } from "@/components/ui/number-rollup";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";
import { usePeriodPill, type Period } from "@/lib/admin/use-period-pill";
import { encodeReturnTo } from "@/lib/admin/return-to";

const BAR_HEIGHT_MAX = 110;
const BAR_HEIGHT_MIN = 4;
const RETURN_TO_PATH = "/(admin)/izvestaji/rezervacije";

export default function IzvestajiRezervacije() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const { period, setPeriod, window: periodWindow } = usePeriodPill("month");

  const detailQuery = useQuery(
    reportsQueries.bookingsDetail({ ...periodWindow, period }),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }

  const headline = detailQuery.data?.headline;
  const timeSeries = useMemo(
    () => detailQuery.data?.timeSeries ?? [],
    [detailQuery.data?.timeSeries],
  );
  const topSessions = useMemo(
    () => detailQuery.data?.topSessions ?? [],
    [detailQuery.data?.topSessions],
  );

  const maxBucketCount = useMemo(
    () => timeSeries.reduce((m, b) => (b.bookingCount > m ? b.bookingCount : m), 0),
    [timeSeries],
  );

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

  // Width budget — full screen minus 24px page padding either side, minus
  // the card's 20px inner padding either side. Mirrors Prihod chart math.
  const chartWidth = Math.max(width - 24 * 2 - 20 * 2, 200);
  const barGap = 4;
  const bucketCount = Math.max(timeSeries.length, 1);
  const barWidth = Math.max(
    (chartWidth - barGap * (bucketCount - 1)) / bucketCount,
    6,
  );

  // Headline tile values — render 0 when the query is still loading or
  // errored. NumberRollup animates from the previous value so brief loads
  // don't flash.
  const totalBookings = headline?.totalBookings ?? 0;
  const showRatePct = Math.round((headline?.showRate ?? 0) * 100);
  const canceledTotal = headline?.canceledTotal ?? 0;
  const canceledPreCutoff = headline?.canceledPreCutoff ?? 0;
  const canceledLate = headline?.canceledLate ?? 0;
  const waitlistCount = headline?.waitlistCount ?? 0;

  function drillToSession(sessionId: string) {
    router.push({
      pathname: "/(admin)/pregled/sessions/[id]",
      params: { id: sessionId, returnTo: encodeReturnTo(RETURN_TO_PATH) },
    });
  }

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.rezervacije.title")}
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
        {/* Period pill. */}
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

        {/* Headline tiles — 2×2 grid. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 60 }}
        >
          <View style={{ gap: 12 }}>
            <Text className="text-muted" style={{ fontSize: 12 }}>
              {rangeLabel}
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Tile
                testID="rezervacije-tile-total"
                label={t("admin.izvestaji.rezervacije.tiles.total")}
                value={totalBookings}
                formatter={(n) => n.toLocaleString(dateLocale)}
              />
              <Tile
                testID="rezervacije-tile-show-rate"
                label={t("admin.izvestaji.rezervacije.tiles.showRate")}
                value={showRatePct}
                formatter={(n) => `${n}%`}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Tile
                testID="rezervacije-tile-canceled"
                label={t("admin.izvestaji.rezervacije.tiles.canceled")}
                value={canceledTotal}
                formatter={(n) => n.toLocaleString(dateLocale)}
                sub={t("admin.izvestaji.rezervacije.tiles.canceledSub", {
                  preCutoff: canceledPreCutoff,
                  late: canceledLate,
                })}
              />
              <Tile
                testID="rezervacije-tile-waitlist"
                label={t("admin.izvestaji.rezervacije.tiles.waitlist")}
                value={waitlistCount}
                formatter={(n) => n.toLocaleString(dateLocale)}
              />
            </View>
          </View>
        </MotiView>

        {/* Cancel breakdown — stacked bar. Non-interactive for now. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.rezervacije.cancelBreakdown.title")}
            </CapsLabel>
            <View style={{ paddingTop: 12 }}>
              {canceledTotal === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.rezervacije.cancelBreakdown.empty")}
                </Text>
              ) : (
                <CancelBreakdown
                  preCutoff={canceledPreCutoff}
                  late={canceledLate}
                  accent={tokens.accent}
                  glassBorder={tokens.glassBorder}
                />
              )}
            </View>
          </GlassCard>
        </MotiView>

        {/* Time-series chart. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 180 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.rezervacije.chart.title")}
            </CapsLabel>

            {detailQuery.isLoading ? (
              <View style={{ paddingTop: 16 }}>
                <SkeletonCard />
              </View>
            ) : null}
            {detailQuery.isError ? (
              <ErrorState message={t("admin.manage.reportsError")} />
            ) : null}
            {!detailQuery.isLoading &&
            !detailQuery.isError &&
            timeSeries.length > 0 ? (
              <View style={{ paddingTop: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    height: BAR_HEIGHT_MAX + 4,
                    gap: barGap,
                  }}
                >
                  {timeSeries.map((b, idx) => {
                    const ratio =
                      maxBucketCount > 0 ? b.bookingCount / maxBucketCount : 0;
                    const h =
                      b.bookingCount === 0
                        ? BAR_HEIGHT_MIN
                        : Math.max(BAR_HEIGHT_MIN, ratio * BAR_HEIGHT_MAX);
                    return (
                      <View
                        key={b.bucketStart}
                        testID={`rezervacije-bar-${idx}`}
                        accessibilityLabel={`${b.bookingCount}`}
                        style={{
                          width: barWidth,
                          height: h,
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                          backgroundColor:
                            b.bookingCount > 0
                              ? tokens.accent
                              : tokens.glassBorder,
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
                  {[0, Math.floor(timeSeries.length / 2), timeSeries.length - 1]
                    .filter((v, i, arr) => arr.indexOf(v) === i && v >= 0)
                    .map((idx) => (
                      <Text
                        key={idx}
                        className="text-muted"
                        style={{ fontSize: 10 }}
                      >
                        {new Date(timeSeries[idx].bucketStart).toLocaleDateString(
                          dateLocale,
                          { day: "numeric", month: "short" },
                        )}
                      </Text>
                    ))}
                </View>
              </View>
            ) : null}
            {!detailQuery.isLoading &&
            !detailQuery.isError &&
            timeSeries.length === 0 ? (
              <View style={{ paddingTop: 12 }}>
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.rezervacije.noData")}
                </Text>
              </View>
            ) : null}
          </GlassCard>
        </MotiView>

        {/* Top sessions. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.rezervacije.topSessions.title")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 8 }}>
              {detailQuery.isLoading ? <SkeletonCard /> : null}
              {detailQuery.isError ? (
                <ErrorState message={t("admin.manage.reportsError")} />
              ) : null}
              {!detailQuery.isLoading &&
              !detailQuery.isError &&
              topSessions.length === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.rezervacije.noData")}
                </Text>
              ) : null}
              {topSessions.map((s) => (
                <Pressable
                  key={s.sessionId}
                  testID={`rezervacije-top-${s.sessionId}`}
                  onPress={() => drillToSession(s.sessionId)}
                  android_ripple={null}
                  className="active:opacity-70"
                  style={{
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: tokens.glassBorder,
                  }}
                >
                  <View className="flex-row justify-between items-center">
                    <View style={{ flex: 1, gap: 2, paddingRight: 12 }}>
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {s.classTypeName}
                        {s.roomName ? ` · ${s.roomName}` : ""}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {new Date(s.startsAt).toLocaleString(dateLocale, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                    <Text
                      className="text-foreground font-body-bold"
                      style={{ fontSize: 13 }}
                    >
                      {t("admin.izvestaji.rezervacije.topSessions.bookedOfCapacity", {
                        booked: s.bookedCount,
                        capacity: s.capacity,
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

type TileProps = {
  testID: string;
  label: string;
  value: number;
  formatter: (n: number) => string;
  sub?: string;
};

function Tile({ testID, label, value, formatter, sub }: TileProps) {
  return (
    <View
      testID={testID}
      style={{ flex: 1 }}
    >
      <GlassCard size="md">
        <View style={{ gap: 4 }}>
          <CapsLabel size={10} tracking={1.4} className="text-muted">
            {label}
          </CapsLabel>
          <NumberRollup
            value={value}
            formatter={formatter}
            className="text-foreground font-body-bold"
            style={{ fontSize: 28, lineHeight: 32, letterSpacing: -0.5 }}
          />
          {sub ? (
            <Text className="text-muted" style={{ fontSize: 11 }} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </GlassCard>
    </View>
  );
}

type CancelBreakdownProps = {
  preCutoff: number;
  late: number;
  accent: string;
  glassBorder: string;
};

function CancelBreakdown({
  preCutoff,
  late,
  accent,
  glassBorder,
}: CancelBreakdownProps) {
  const { t } = useTranslation();
  const total = preCutoff + late;
  const prePct = total > 0 ? (preCutoff / total) * 100 : 0;
  const latePct = total > 0 ? (late / total) * 100 : 0;
  // Late uses a half-alpha accent so the two segments are visually distinct
  // without bringing in a second hue. Same trick as the heatmap tiers.
  const lateColor = `${accent}99`;
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          height: 10,
          borderRadius: 5,
          backgroundColor: glassBorder,
          overflow: "hidden",
          flexDirection: "row",
        }}
      >
        <View
          testID="rezervacije-cancel-precutoff"
          style={{
            width: `${prePct}%`,
            height: "100%",
            backgroundColor: accent,
          }}
        />
        <View
          testID="rezervacije-cancel-late"
          style={{
            width: `${latePct}%`,
            height: "100%",
            backgroundColor: lateColor,
          }}
        />
      </View>
      <View className="flex-row justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <Text className="text-foreground" style={{ fontSize: 12 }}>
            {t("admin.izvestaji.rezervacije.cancelBreakdown.preCutoff")}
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {preCutoff}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: lateColor,
            }}
          />
          <Text className="text-foreground" style={{ fontSize: 12 }}>
            {t("admin.izvestaji.rezervacije.cancelBreakdown.late")}
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {late}
          </Text>
        </View>
      </View>
    </View>
  );
}
