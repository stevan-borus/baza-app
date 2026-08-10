import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  TimeAxisDayView,
  type SessionBlock,
} from "@/components/ui/time-axis-day-view";
import { MonthView } from "@/components/ui/month-view";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { AdminPregledLeftSlot } from "@/components/admin/admin-tab-left-slot";
import {
  SkeletonCard,
  SkeletonList,
  SkeletonStatCard,
} from "@/components/ui/skeleton";
import { CapsLabel, StudioWeekStrip, StatStrip } from "@/components/ui/studio";
import {
  SessionEditSheet,
  useSessionEditSheet,
} from "@/components/ui/session-edit-sheet";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { activeClientRate } from "@/lib/format";
import { useWeekNavigation, weekRangeLabel } from "@/lib/use-week-navigation";

/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — numbers-first hero, dashboard density
 * - Linear Mobile ios Apr 2026/ — segmented control + list density
 * - WHOOP ios Apr 2024/ — 2×2 stat grouping
 */

type ScheduleTab = "day" | "month";

export default function AdminSchedule() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const bottomPad = useTabBarBottomPadding(24);
  const nav = useWeekNavigation();
  const { selectedDate, weekStart, month, monthDate } = nav;
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day");
  const editSheet = useSessionEditSheet();

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );
  const summaryQuery = useQuery(reportsQueries.summary());
  const summary = summaryQuery.data?.summary;

  const sessions = availabilityQuery.data?.sessions ?? [];

  // Filter sessions for selected day
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // YYYY-MM-DD → number of sessions on that day. Drives the dot indicator
  // under each day pill in StudioWeekStrip and MonthView.
  const sessionsByDay = sessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  function handleMonthCellSelect(date: string) {
    // Tapping a day in MonthView selects the date and switches to Day view,
    // realigning the week strip so the chosen day is in the visible week.
    nav.selectMonthCell(date);
    setScheduleTab("day");
  }

  function handleEventPress(session: typeof sessions[0]) {
    router.push(`/(admin)/pregled/sessions/${session.id}`);
  }

  const revenueValue = summary?.revenue ?? 0;
  const attendanceRate = summary
    ? activeClientRate(summary.activeClients, summary.totalClients)
    : undefined;

  const isDashboardLoading =
    summaryQuery.isLoading || availabilityQuery.isLoading;

  if (isDashboardLoading) {
    return (
      <ScreenContainerRaw title={t("tabs.dashboard")} leftSlot={<AdminPregledLeftSlot />}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: bottomPad }}
        >
          <View className="pt-4 flex-col gap-4">
            <SkeletonCard />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <SkeletonStatCard />
              </View>
              <View className="flex-1">
                <SkeletonStatCard />
              </View>
            </View>
            <SkeletonList count={3} />
          </View>
        </ScrollView>
      </ScreenContainerRaw>
    );
  }

  return (
    <ScreenContainerRaw title={t("tabs.dashboard")} leftSlot={<AdminPregledLeftSlot />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomPad }}
      >
        {/* ── Revenue hero — caps overline + giant numeral on bone ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <View className="px-5 pb-6">
            <CapsLabel size={11} tracking={1.6} className="text-muted">
              {t("admin.dashboard.revenueThisMonth")}
            </CapsLabel>
            <View className="flex-row items-baseline mt-1.5">
              <NumberRollup
                value={revenueValue}
                formatter={(n) =>
                  `${Math.round(n).toLocaleString("sr-RS")}`
                }
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
          </View>
        </MotiView>

        {/* ── Editorial stat strip — 4 hairline-separated columns ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
          className="mb-6"
        >
          <StatStrip
            columns={2}
            items={[
              {
                label: t("admin.dashboard.sessionsToday"),
                value: daySessions.length,
              },
              {
                label: t("admin.dashboard.activeClients"),
                value: summary?.activeClients,
              },
              {
                label: t("admin.dashboard.newClientsMonth"),
                value: summary
                  ? summary.totalClients - summary.inactiveClients
                  : undefined,
              },
              {
                label: t("admin.dashboard.attendanceRate"),
                value:
                  attendanceRate === undefined
                    ? undefined
                    : `${attendanceRate}%`,
                accent: true,
              },
            ]}
          />
        </MotiView>

        {/* ── Schedule section ───────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 280 }}
        >
          {/* Segmented control */}
          <View className="px-6 pb-4">
            <SegmentedControl<ScheduleTab>
              options={[
                { value: "day", label: t("admin.schedule.viewDay") },
                { value: "month", label: t("admin.schedule.viewMonth") },
              ]}
              value={scheduleTab}
              onChange={setScheduleTab}
            />
          </View>

          {scheduleTab === "day" ? (
            <>
              <View className="pb-4">
                <StudioWeekStrip
                  weekStart={weekStart}
                  selected={dayjs(selectedDate)}
                  onSelect={nav.selectDay}
                  sessionsByDay={sessionsByDay}
                  onPrevWeek={nav.goToPreviousWeek}
                  onNextWeek={nav.goToNextWeek}
                  rangeLabel={weekRangeLabel(weekStart, lang)}
                />
              </View>

              {availabilityQuery.isError ? (
                <View className="px-5">
                  <ErrorState message={t("admin.schedule.error")} />
                </View>
              ) : null}

              {/* Day sessions list */}
              <View className="px-5">
                <View className="pb-3">
                  <CapsLabel size={12} tracking={2.4}>
                    {displayDate.locale(lang).format("dddd, D MMMM").toUpperCase()}
                  </CapsLabel>
                </View>

                {daySessions.length === 0 ? (
                  <View className="flex-col gap-3">
                    <EmptyState title={t("client.dayView.noSessions")} />
                  </View>
                ) : (
                  <TimeAxisDayView
                    embedded
                    date={selectedDate}
                    sessions={daySessions.map(
                      (s): SessionBlock => ({
                        id: s.id,
                        startsAt:
                          typeof s.startsAt === "string"
                            ? s.startsAt
                            : s.startsAt.toISOString(),
                        endsAt:
                          typeof s.endsAt === "string"
                            ? s.endsAt
                            : s.endsAt.toISOString(),
                        classTypeName: s.classTypeName,
                        roomName: s.roomName,
                        bookedCount: s.bookedCount,
                        capacity: s.capacity,
                        isIntermediate: s.isIntermediate,
                        isMixedGroup: s.isMixedGroup,
                        emptyCutoffLocked: s.emptyCutoffLocked,
                        status:
                          s.availableSlots > 0 ? "available" : "full",
                      }),
                    )}
                    onSessionPress={(b) => {
                      const full = daySessions.find((x) => x.id === b.id);
                      if (full) handleEventPress(full);
                    }}
                    showNowLine
                  />
                )}
              </View>
            </>
          ) : (
            <View className="px-5">
              <MonthView
                month={monthDate}
                selectedDate={selectedDate}
                onSelectDate={handleMonthCellSelect}
                onPrevMonth={nav.goToPreviousMonth}
                onNextMonth={nav.goToNextMonth}
                activity={sessionsByDay}
              />
            </View>
          )}
        </MotiView>

      </ScrollView>

      <SessionEditSheet {...editSheet.bind()} />
    </ScreenContainerRaw>
  );
}

