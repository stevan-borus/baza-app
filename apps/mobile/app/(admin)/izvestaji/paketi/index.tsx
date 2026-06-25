/**
 * Izveštaji → Paketi sub-page (P3-5).
 *
 * Anatomy: period pill, 2×2 headline tiles, a "most-sold" list with %-of-
 * total bars, a paid-vs-comp stacked bar, and the last few activations.
 * Each activation row taps into the client detail page with a `returnTo`
 * pointing back here so the destination renders a Nazad pill.
 *
 * "Active packages" and "Expiring soon" are period-independent on purpose
 * — the number a studio admin actually wants to read is "how many packages
 * are live right now / about to lapse" regardless of which pill is
 * selected. Consumption rate and Sold-in-period DO move with the pill.
 *
 * The existing "Aktivne dodele" link to the assignments list is kept so
 * admins can still drill into the full list — that screen has search /
 * filter affordances this page doesn't need.
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
} from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { SkeletonBreakdownRows, SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel, StatStrip } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { usePeriodPill, type Period } from "@/lib/admin/use-period-pill";
import { drillHref } from "@/lib/admin/drill";

const RETURN_TO_PATH = "/(admin)/izvestaji/paketi";

export default function IzvestajiPaketi() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { period, setPeriod, window: periodWindow } = usePeriodPill("month");

  const detailQuery = useQuery(
    reportsQueries.packagesDetail({ ...periodWindow, period }),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: reportsQueries.all });
    setRefreshing(false);
  }

  const headline = detailQuery.data?.headline;
  const mostSold = useMemo(
    () => detailQuery.data?.mostSold ?? [],
    [detailQuery.data?.mostSold],
  );
  const compVsPaid = detailQuery.data?.compVsPaid;
  const recentActivations = useMemo(
    () => detailQuery.data?.recentActivations ?? [],
    [detailQuery.data?.recentActivations],
  );

  const dateLocale = i18n.language === "en" ? "en-US" : "sr-RS";
  const rangeLabel = useMemo(() => {
    if (!periodWindow.from || !periodWindow.to) {
      return t("admin.manage.periodAll");
    }
    const fromD = new Date(periodWindow.from);
    const toD = new Date(periodWindow.to);
    const inclusiveTo = new Date(toD.getTime() - 1);
    const crossesYear =
      fromD.getUTCFullYear() !== inclusiveTo.getUTCFullYear();
    const fmt: Intl.DateTimeFormatOptions = crossesYear
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" };
    return `${fromD.toLocaleDateString(dateLocale, fmt)} – ${inclusiveTo.toLocaleDateString(dateLocale, fmt)}`;
  }, [periodWindow.from, periodWindow.to, dateLocale, t]);

  const activePackages = headline?.activePackages ?? 0;
  const expiringSoon = headline?.expiringSoon ?? 0;
  const consumptionPct = Math.round((headline?.consumptionRate ?? 0) * 100);
  const soldInPeriod = headline?.soldInPeriod ?? 0;
  const paid = compVsPaid?.paid ?? 0;
  const comp = compVsPaid?.comp ?? 0;
  const compTotal = paid + comp;

  const mostSoldTotal = useMemo(
    () => mostSold.reduce((acc, row) => acc + row.count, 0),
    [mostSold],
  );

  function drillToClient(clientUserId: string) {
    router.push(
      drillHref({ to: "klijent", returnTo: RETURN_TO_PATH, clientUserId }),
    );
  }

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("admin.izvestaji.paketi.title")}
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
              { value: "month" as Period, label: t("admin.manage.periodMonth") },
              { value: "quarter" as Period, label: t("admin.manage.periodQuarter") },
              { value: "year" as Period, label: t("admin.manage.periodYear") },
              { value: "all" as Period, label: t("admin.manage.periodAllShort") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </MotiView>

        {/* Headline tiles — editorial 2×2 with hairline cross-rules. Mirrors
            the Pregled-landing StatStrip so non-clickable stats read as
            information, not affordances. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 60 }}
        >
          <View style={{ gap: 8 }}>
            <Text className="text-muted" style={{ fontSize: 12 }}>
              {rangeLabel}
            </Text>
            <StatStrip
              className=""
              columns={2}
              items={[
                {
                  label: t("admin.izvestaji.paketi.tiles.active"),
                  value: activePackages
                    ? activePackages.toLocaleString(dateLocale)
                    : undefined,
                },
                {
                  label: t("admin.izvestaji.paketi.tiles.expiringSoon"),
                  value: expiringSoon
                    ? expiringSoon.toLocaleString(dateLocale)
                    : undefined,
                },
                {
                  label: t("admin.izvestaji.paketi.tiles.consumptionRate"),
                  value: consumptionPct ? `${consumptionPct}%` : undefined,
                  accent: true,
                },
                {
                  label: t("admin.izvestaji.paketi.tiles.soldInPeriod"),
                  value: soldInPeriod
                    ? soldInPeriod.toLocaleString(dateLocale)
                    : undefined,
                },
              ]}
            />
          </View>
        </MotiView>

        {/* Most-sold breakdown — list with %-of-total bars. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.paketi.mostSold.title")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 10 }}>
              {detailQuery.isLoading ? <SkeletonBreakdownRows /> : null}
              {detailQuery.isError ? (
                <ErrorState message={t("admin.manage.reportsError")} />
              ) : null}
              {!detailQuery.isLoading &&
              !detailQuery.isError &&
              mostSold.length === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.paketi.noData")}
                </Text>
              ) : null}
              {mostSold.map((row) => {
                const pct =
                  mostSoldTotal > 0 ? (row.count / mostSoldTotal) * 100 : 0;
                return (
                  <View
                    key={row.packageTypeId}
                    testID={`paketi-most-sold-${row.packageTypeId}`}
                    style={{ gap: 6 }}
                  >
                    <View className="flex-row justify-between items-center">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 14, flex: 1, paddingRight: 12 }}
                        numberOfLines={1}
                      >
                        {row.packageTypeName}
                      </Text>
                      <Text
                        className="text-foreground font-body-bold"
                        style={{ fontSize: 13 }}
                      >
                        {row.count}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: tokens.glassBorder,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          backgroundColor: tokens.accent,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </GlassCard>
        </MotiView>

        {/* Paid vs comp — stacked horizontal bar. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 180 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.paketi.compVsPaid.title")}
            </CapsLabel>
            <View style={{ paddingTop: 12 }}>
              {compTotal === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.paketi.noData")}
                </Text>
              ) : (
                <PaidVsCompBar
                  paid={paid}
                  comp={comp}
                  accent={tokens.accent}
                  glassBorder={tokens.glassBorder}
                />
              )}
            </View>
          </GlassCard>
        </MotiView>

        {/* Recent activations. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <GlassCard size="lg">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {t("admin.izvestaji.paketi.recentActivations.title")}
            </CapsLabel>
            <View style={{ paddingTop: 12, gap: 4 }}>
              {detailQuery.isLoading ? <SkeletonList count={4} /> : null}
              {detailQuery.isError ? (
                <ErrorState message={t("admin.manage.reportsError")} />
              ) : null}
              {!detailQuery.isLoading &&
              !detailQuery.isError &&
              recentActivations.length === 0 ? (
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {t("admin.izvestaji.paketi.noData")}
                </Text>
              ) : null}
              {recentActivations.map((row, idx) => (
                <Pressable
                  key={row.clientPackageId}
                  testID={`paketi-recent-${row.clientPackageId}`}
                  onPress={() => drillToClient(row.clientUserId)}
                  android_ripple={null}
                  className="active:opacity-70"
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth:
                      idx < recentActivations.length - 1 ? 1 : 0,
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
                        {row.clientFullName}
                      </Text>
                      <Text
                        className="text-muted"
                        style={{ fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {row.packageTypeName} ·{" "}
                        {new Date(row.startsAt).toLocaleDateString(dateLocale, {
                          day: "numeric",
                          month: "short",
                        })}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: row.isPaid
                          ? tokens.accent
                          : tokens.glassBorder,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          color: row.isPaid ? tokens.background : tokens.foreground,
                          letterSpacing: 0.6,
                          fontWeight: "600",
                          textTransform: "uppercase",
                        }}
                      >
                        {row.isPaid
                          ? t("admin.izvestaji.paketi.recentActivations.paidTag")
                          : t("admin.izvestaji.paketi.recentActivations.compTag")}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </GlassCard>
        </MotiView>

        {/* "Aktivne dodele" link — kept from P3-1 scaffold for admins who
            want the full filterable assignment list. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 300 }}
        >
          <Pressable
            testID="paketi-active-assignments-link"
            onPress={() => router.push("/(admin)/izvestaji/paketi/aktivne-dodele")}
            android_ripple={null}
            style={{ borderRadius: 14 }}
          >
            <GlassCard size="md">
              <View className="flex-row items-center gap-3">
                <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
                  <Icon name="users" size={16} color={tokens.accent} />
                </View>
                <Text
                  className="flex-1 text-foreground font-body-semibold"
                  style={{ fontSize: 15 }}
                >
                  {t("admin.izvestaji.paketi.activeAssignmentsLink")}
                </Text>
                <Icon name="chevron-right" size={16} color={tokens.faint} />
              </View>
            </GlassCard>
          </Pressable>
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}


type PaidVsCompBarProps = {
  paid: number;
  comp: number;
  accent: string;
  glassBorder: string;
};

function PaidVsCompBar({ paid, comp, accent, glassBorder }: PaidVsCompBarProps) {
  const { t } = useTranslation();
  const total = paid + comp;
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  const compPct = total > 0 ? (comp / total) * 100 : 0;
  // Comp uses a half-alpha accent so the two segments are visually distinct
  // without bringing in a second hue. Same trick as the cancel breakdown.
  const compColor = `${accent}99`;
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
          testID="paketi-bar-paid"
          style={{
            width: `${paidPct}%`,
            height: "100%",
            backgroundColor: accent,
          }}
        />
        <View
          testID="paketi-bar-comp"
          style={{
            width: `${compPct}%`,
            height: "100%",
            backgroundColor: compColor,
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
            {t("admin.izvestaji.paketi.compVsPaid.paid")}
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {paid}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: compColor,
            }}
          />
          <Text className="text-foreground" style={{ fontSize: 12 }}>
            {t("admin.izvestaji.paketi.compVsPaid.comp")}
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {comp}
          </Text>
        </View>
      </View>
    </View>
  );
}
