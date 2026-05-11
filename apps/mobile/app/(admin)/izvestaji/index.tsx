/**
 * Admin Reports — landing screen (P3-1).
 *
 * Replaces the old 657-line single-page reports. This is now a 4-card hub
 * (Prihod / Iskorišćenost / Rezervacije / Paketi), each card linking to its
 * own sub-page where the full breakdown lives (P3-2 → P3-5). The period
 * pill at the top drives the headline numbers shown on each card so the
 * hub gives a one-glance overview without scrolling.
 *
 * Headline numbers are sourced from the existing `reportsQueries.summary` +
 * `revenue` endpoints — no new server data is added in P3-1 (structure-only).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { CapsLabel } from "@/components/ui/studio";
import { NumberRollup } from "@/components/ui/number-rollup";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AvatarMenu } from "@/components/admin/avatar-menu";
import { usePeriodPill } from "@/lib/admin/use-period-pill";

export default function AdminReportsLanding() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [refreshing, setRefreshing] = useState(false);
  const { period, setPeriod, window: periodWindow } = usePeriodPill("month");

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  }

  const summaryQuery = useQuery(reportsQueries.summary(periodWindow));
  const utilizationQuery = useQuery(
    reportsQueries.utilization({ ...periodWindow, period: "month" }),
  );

  const summary = summaryQuery.data?.summary;

  // Average utilization across the period — collapses the per-bucket rows
  // into one headline percentage for the landing card.
  const avgUtilization = useMemo(() => {
    const rows = utilizationQuery.data?.data ?? [];
    if (rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => acc + r.utilization, 0);
    return sum / rows.length;
  }, [utilizationQuery.data?.data]);

  const cards: LandingCardProps[] = [
    {
      testID: "izvestaji-card-prihod",
      title: t("admin.izvestaji.sections.prihod"),
      headline: summary?.revenue,
      sublabel: t("admin.izvestaji.headlines.prihodSub"),
      icon: "trending-up",
      target: "/(admin)/izvestaji/prihod",
      formatter: (n) => `${Math.round(n).toLocaleString("sr-RS")} RSD`,
    },
    {
      testID: "izvestaji-card-iskoriscenost",
      title: t("admin.izvestaji.sections.iskoriscenost"),
      headline: avgUtilization,
      sublabel: t("admin.izvestaji.headlines.iskoriscenostSub"),
      icon: "pie-chart",
      target: "/(admin)/izvestaji/iskoriscenost",
      formatter: (n) => `${Math.round(n * 100)}%`,
    },
    {
      testID: "izvestaji-card-rezervacije",
      title: t("admin.izvestaji.sections.rezervacije"),
      headline: summary?.totalSessions,
      sublabel: t("admin.izvestaji.headlines.rezervacijeSub"),
      icon: "calendar",
      target: "/(admin)/izvestaji/rezervacije",
    },
    {
      testID: "izvestaji-card-paketi",
      title: t("admin.izvestaji.sections.paketi"),
      headline: summary?.activeClients,
      sublabel: t("admin.izvestaji.headlines.paketiSub"),
      icon: "package",
      target: "/(admin)/izvestaji/paketi",
    },
  ];

  return (
    <ScreenContainerRaw title={t("tabs.reports")} rightSlot={<AvatarMenu />}>
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
        {/* Period pill — drives all four card headlines */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <SegmentedControl
            options={[
              { value: "week" as const, label: t("admin.manage.periodWeek") },
              { value: "month" as const, label: t("admin.manage.periodMonth") },
              { value: "quarter" as const, label: t("admin.manage.periodQuarter") },
              { value: "year" as const, label: t("admin.manage.periodYear") },
              { value: "all" as const, label: t("admin.manage.periodAll") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </MotiView>

        {summaryQuery.isError ? (
          <ErrorState message={t("admin.manage.reportsError")} />
        ) : null}

        {/* 2×2 grid */}
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
          {cards.map((card, idx) => (
            <View
              key={card.testID}
              style={{ width: "50%", paddingHorizontal: 6, paddingBottom: 12 }}
            >
              <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 350, delay: 80 + idx * 60 }}
              >
                <LandingCard {...card} />
              </MotiView>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainerRaw>
  );
}

type LandingCardProps = {
  testID: string;
  title: string;
  headline: number | undefined;
  sublabel: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  target: Href;
  formatter?: (n: number) => string;
};

function LandingCard({
  testID,
  title,
  headline,
  sublabel,
  icon,
  target,
  formatter,
}: LandingCardProps) {
  const tokens = useThemeTokens();
  const value = headline ?? 0;
  const hasValue = headline !== undefined && headline !== null;
  return (
    <Pressable
      testID={testID}
      onPress={() => router.push(target)}
      android_ripple={null}
      className="active:opacity-70"
      style={{ borderRadius: 18 }}
    >
      <GlassCard size="md">
        <View className="gap-3" style={{ minHeight: 132 }}>
          <View className="flex-row items-center justify-between">
            <CapsLabel size={10} tracking={1.4} className="text-muted">
              {title}
            </CapsLabel>
            <Feather name={icon} size={14} color={tokens.faint} />
          </View>
          {hasValue ? (
            <NumberRollup
              value={value}
              formatter={formatter ?? ((n) => String(Math.round(n)))}
              className="text-foreground font-body-bold"
              style={{ fontSize: 26, letterSpacing: -0.6, lineHeight: 30 }}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          ) : (
            <Text
              className="text-muted font-body-bold"
              style={{ fontSize: 26, letterSpacing: -0.6, lineHeight: 30 }}
            >
              —
            </Text>
          )}
          <View className="flex-row items-center gap-1">
            <Text className="text-muted" style={{ fontSize: 11 }} numberOfLines={1}>
              {sublabel}
            </Text>
            <Feather name="chevron-right" size={12} color={tokens.faint} />
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );
}
