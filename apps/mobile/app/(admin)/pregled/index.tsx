import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SessionCard } from "@/components/ui/session-card";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import {
  SkeletonCard,
  SkeletonList,
  SkeletonStatCard,
} from "@/components/ui/skeleton";
import { useThemeTokens } from "@/components/ui/tokens";
import { CapsLabel, StudioWeekStrip, StatStrip } from "@/components/ui/studio";
import { HeaderIconButton } from "@/components/ui/app-header";
import { AvatarMenu } from "@/components/admin/avatar-menu";
import { NewSessionSheet } from "@/components/admin/new-session-sheet";
import {
  SessionEditSheet,
  useSessionEditSheet,
} from "@/components/ui/session-edit-sheet";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — numbers-first hero, dashboard density
 * - Linear Mobile ios Apr 2026/ — segmented control + list density
 * - WHOOP ios Apr 2024/ — 2×2 stat grouping
 */

type ScheduleTab = "day" | "month";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function AdminSchedule() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const prevDateRef = React.useRef(selectedDate);
  const dayDirection = React.useMemo(() => {
    const prev = prevDateRef.current;
    const dir = selectedDate > prev ? 1 : selectedDate < prev ? -1 : 1;
    prevDateRef.current = selectedDate;
    return dir;
  }, [selectedDate]);
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [monthDate, setMonthDate] = useState(() => dayjs().startOf("month"));
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day");
  const [showCreate, setShowCreate] = useState(false);
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

  function handleDateSelect(d: dayjs.Dayjs) {
    const date = d.format("YYYY-MM-DD");
    // Pick a day. NEVER mutate `weekStart` or `month` here — picking a day
    // inside the visible week must not page the calendar.
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
  }

  function handlePrevWeek() {
    const newStart = weekStart.subtract(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }

  function handleNextWeek() {
    const newStart = weekStart.add(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }

  function handlePrevMonth() {
    const newMonthDate = monthDate.subtract(1, "month");
    setMonthDate(newMonthDate);
    setMonth(newMonthDate.format("YYYY-MM"));
  }

  function handleNextMonth() {
    const newMonthDate = monthDate.add(1, "month");
    setMonthDate(newMonthDate);
    setMonth(newMonthDate.format("YYYY-MM"));
  }

  function handleMonthCellSelect(date: string) {
    // Tapping a day in MonthView selects the date and switches to Day view,
    // realigning the week strip so the chosen day is in the visible week.
    setSelectedDate(date);
    setWeekStart(startOfLocaleWeek(dayjs(date)));
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
    setScheduleTab("day");
  }

  function handleEventPress(session: typeof sessions[0]) {
    router.push(`/(admin)/pregled/sessions/${session.id}`);
  }

  const revenueValue = summary?.revenue ?? 0;
  const attendanceRate =
    summary && summary.totalSessions > 0
      ? Math.round((summary.activeClients / summary.totalClients) * 100)
      : 0;

  const isDashboardLoading =
    summaryQuery.isLoading || availabilityQuery.isLoading;

  if (isDashboardLoading) {
    return (
      <ScreenContainerRaw title={t("tabs.dashboard")}>
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
    <ScreenContainerRaw
      title={t("tabs.dashboard")}
      rightSlot={
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <AvatarMenu />
          <HeaderIconButton
            icon="plus"
            onPress={() => setShowCreate(true)}
            accessibilityLabel={t("admin.schedule.newSession")}
            testID="admin-new-session-button"
          />
        </View>
      }
    >
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
                value: summary ? `${attendanceRate}%` : undefined,
                accent: true,
              },
            ]}
          />
        </MotiView>

        {/* ── Studio quick-actions: hairline list rows ── */}
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 220 }}
          className="mb-6"
        >
          <View className="mx-5 border-t border-b border-glass-border">
            <Pressable
              testID="admin-quick-class-types"
              onPress={() => router.push("/(admin)/katalog/tipovi-treninga")}
              android_ripple={null}
              className="flex-row items-center justify-between py-4 active:opacity-60"
            >
              <View className="flex-row items-center gap-3 flex-1">
                <Feather name="list" size={16} color={tokens.muted} />
                <Text className="text-foreground font-body-medium" style={{ fontSize: 15 }}>
                  {t("admin.manage.classTypes")}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={tokens.faint} />
            </Pressable>
            <View className="bg-glass-border" style={{ height: 1 }} />
            <Pressable
              testID="admin-quick-rooms"
              onPress={() => router.push("/(admin)/katalog/sale")}
              android_ripple={null}
              className="flex-row items-center justify-between py-4 active:opacity-60"
            >
              <View className="flex-row items-center gap-3 flex-1">
                <Feather name="home" size={16} color={tokens.muted} />
                <Text className="text-foreground font-body-medium" style={{ fontSize: 15 }}>
                  {t("admin.manage.rooms")}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={tokens.faint} />
            </Pressable>
          </View>
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
                  onSelect={handleDateSelect}
                  sessionsByDay={sessionsByDay}
                  onPrevWeek={handlePrevWeek}
                  onNextWeek={handleNextWeek}
                  rangeLabel={`${weekStart.locale(lang).format("D. MMM")} — ${weekStart
                    .add(6, "day")
                    .locale(lang)
                    .format("D. MMM")}`}
                />
              </View>

              {availabilityQuery.isError ? (
                <View className="px-5">
                  <ErrorState message={t("admin.schedule.error")} />
                </View>
              ) : null}

              {/* Day sessions list */}
              <View className="px-5">
                <View className="flex-row items-baseline justify-between pb-3">
                  <CapsLabel size={12} tracking={2.4}>
                    {displayDate.locale(lang).format("dddd, D MMMM").toUpperCase()}
                  </CapsLabel>
                  {daySessions.length > 0 ? (
                    <Text className="text-xs text-muted">
                      {t("admin.dashboard.classCount", {
                        count: daySessions.length,
                      })}
                    </Text>
                  ) : null}
                </View>

                <View className="flex-col gap-3">
                  {daySessions.length === 0 ? (
                    <EmptyState title={t("client.dayView.noSessions")} />
                  ) : (
                    daySessions.map((session, idx) => (
                      <MotiView
                        // Re-key on selectedDate so MotiView remounts and replays the entry
                        // animation when the user navigates between days.
                        key={`${selectedDate}-${session.id}`}
                        from={{
                          opacity: 0,
                          translateX: dayDirection * 24,
                        }}
                        animate={{ opacity: 1, translateX: 0 }}
                        transition={{
                          type: "timing",
                          duration: 220,
                          delay: Math.min(idx, 8) * 30,
                        }}
                      >
                      <SessionCard
                        testID={`session-card-${session.id}`}
                        time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
                        className={session.classTypeName}
                        trainerName={session.trainerName ?? undefined}
                        room={session.roomName ?? undefined}
                        bookedCount={session.bookedCount}
                        capacity={session.capacity}
                        status={session.availableSlots > 0 ? "available" : "full"}
                        hidden={session.isActive === false}
                        hiddenLabel={t("admin.schedule.hiddenBadge")}
                        onPress={() => handleEventPress(session)}
                      />
                      </MotiView>
                    ))
                  )}
                </View>
              </View>
            </>
          ) : (
            <View className="px-5">
              <MonthView
                month={monthDate}
                selectedDate={selectedDate}
                onSelectDate={handleMonthCellSelect}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                activity={sessionsByDay}
              />
            </View>
          )}
        </MotiView>

      </ScrollView>

      <NewSessionSheet open={showCreate} onOpenChange={setShowCreate} />
      <SessionEditSheet {...editSheet.bind()} />
    </ScreenContainerRaw>
  );
}

