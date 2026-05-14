/**
 * Admin Reports — landing screen (P3-1, revised in PR γ).
 *
 * 4-card hub (Prihod / Iskorišćenost / Rezervacije / Paketi), each card
 * linking to its own sub-page where the full breakdown lives (P3-2 → P3-5).
 * The period pill at the top drives the headline numbers shown on each
 * card so the hub gives a one-glance overview without scrolling.
 *
 * Card visual: bordered square (`aspectRatio: 1`), hairline border, no fill.
 * Caps overline label top-left, big numeral vertically anchored to the
 * bottom, unit underneath. No icon, no chevron — the press affordance is
 * the whole card. The earlier design used a GlassCard with an icon
 * top-right and a chevron inside the sub-label row; carrying two
 * redundant affordances on a tile that's already 50% of the screen width
 * was noise.
 *
 * Headline numbers are sourced from the existing `reportsQueries.summary` +
 * `revenue` endpoints — no new server data.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { MotiView } from "@/components/ui/styled";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { CapsLabel } from "@/components/ui/studio";
import { NumberRollup } from "@/components/ui/number-rollup";
import { useThemeTokens } from "@/components/ui/tokens";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";
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
  const isLoading = summaryQuery.isLoading || utilizationQuery.isLoading;

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
      unit: t("admin.izvestaji.cardUnits.rsd"),
      target: "/(admin)/izvestaji/prihod",
      formatter: (n) => Math.round(n).toLocaleString("sr-RS"),
    },
    {
      testID: "izvestaji-card-iskoriscenost",
      title: t("admin.izvestaji.sections.iskoriscenost"),
      headline: avgUtilization,
      unit: t("admin.izvestaji.cardUnits.percent"),
      target: "/(admin)/izvestaji/iskoriscenost",
      formatter: (n) => `${Math.round(n * 100)}`,
    },
    {
      testID: "izvestaji-card-rezervacije",
      title: t("admin.izvestaji.sections.rezervacije"),
      headline: summary?.totalSessions,
      unit: t("admin.izvestaji.cardUnits.sessions"),
      target: "/(admin)/izvestaji/rezervacije",
    },
    {
      testID: "izvestaji-card-paketi",
      title: t("admin.izvestaji.sections.paketi"),
      headline: summary?.activeClients,
      unit: t("admin.izvestaji.cardUnits.clients"),
      target: "/(admin)/izvestaji/paketi",
    },
  ];

  return (
    <ScreenContainerRaw title={t("tabs.reports")} leftSlot={<AdminTabLeftSlot />}>
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
        {/* Period pill — 4 segments. "Nedelja" was dropped to keep the
            chips one-line at narrow widths (see usePeriodPill header). */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <SegmentedControl
            options={[
              { value: "month" as const, label: t("admin.manage.periodMonth") },
              { value: "quarter" as const, label: t("admin.manage.periodQuarter") },
              { value: "year" as const, label: t("admin.manage.periodYear") },
              { value: "all" as const, label: t("admin.manage.periodAllShort") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </MotiView>

        {summaryQuery.isError ? (
          <ErrorState message={t("admin.manage.reportsError")} />
        ) : null}

        {/* 2×2 grid of equal squares. */}
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
                <LandingCard {...card} isLoading={isLoading} />
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
  unit: string;
  target: Href;
  formatter?: (n: number) => string;
};

function LandingCard({
  testID,
  title,
  headline,
  unit,
  target,
  formatter,
  isLoading,
}: LandingCardProps & { isLoading: boolean }) {
  const tokens = useThemeTokens();
  const hasValue = !isLoading && headline !== undefined && headline !== null;
  const value = headline ?? 0;
  return (
    <Pressable
      testID={testID}
      onPress={() => router.push(target)}
      android_ripple={null}
      className="active:opacity-60 bg-surface"
      style={{
        aspectRatio: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: tokens.glassBorder,
        padding: 16,
        justifyContent: "space-between",
      }}
    >
      {/* Top row — caps overline left, chevron right. The chevron is the
          tappability cue that separates these landing tiles from the
          chrome-less editorial tiles inside each sub-page. */}
      <View className="flex-row items-start justify-between">
        <CapsLabel size={11} tracking={2.4} className="text-muted flex-1">
          {title}
        </CapsLabel>
        <Feather
          name="chevron-right"
          size={14}
          color={tokens.faint}
          style={{ marginTop: 1 }}
        />
      </View>

      {/* Numeral block, anchored to the bottom of the square. The unit
          sits under the numeral as a quiet caps row — never as a sub-
          label that repeats the section name. */}
      <View className="gap-1">
        {hasValue ? (
          <NumberRollup
            value={value}
            formatter={formatter ?? ((n) => String(Math.round(n)))}
            className="text-foreground font-display tabular-nums"
            style={{ fontSize: 36, letterSpacing: -0.5, lineHeight: 40 }}
            numberOfLines={1}
            adjustsFontSizeToFit
          />
        ) : (
          <Text
            className="text-muted font-display tabular-nums"
            style={{ fontSize: 36, letterSpacing: -0.5, lineHeight: 40 }}
          >
            —
          </Text>
        )}
        <Text
          className="text-muted uppercase"
          style={{ fontSize: 11, letterSpacing: 1.4 }}
          numberOfLines={1}
        >
          {unit}
        </Text>
      </View>
    </Pressable>
  );
}
