/**
 * Trainer schedule screen — redesigned (P2-T12).
 *
 * Design references (from docs/inspiration/):
 * - Fresha ios Oct 2024/ — appointment list density, trainer-facing layout
 * - Google Calendar ios May 2021/ — time-axis day view pattern
 *
 * Structure:
 *   ScreenContainerRaw
 *   ├─ Greeting row: "Hello, <trainer name>" + today's date
 *   ├─ HeroCard: "Today's stats" — sessions · clients · hours
 *   ├─ Month nav + WeekStrip
 *   ├─ TimeAxisDayView (session blocks → detail sheet on tap)
 *   └─ Session detail AppSheet (kept verbatim from previous implementation)
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/states";
import { WeekStrip, startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { HeroCard } from "@/components/ui/hero-card";
import {
  TimeAxisDayView,
  type SessionBlock,
} from "@/components/ui/time-axis-day-view";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

type ScheduleTab = "day" | "month";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function TrainerSchedule() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [monthDate, setMonthDate] = useState(() => dayjs().startOf("month"));
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day");
  const [selectedSession, setSelectedSession] = useState<{
    sessionId: string;
    classTypeName: string;
    roomName: string | null;
    bookedCount: number;
    capacity: number;
    availableSlots: number;
    startsAt: Date;
    endsAt: Date;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const displayDate = dayjs(selectedDate);
  const isToday = selectedDate === dayjs().format("YYYY-MM-DD");

  const meQuery = useQuery(authQueries.me());
  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const notifsQuery = useQuery(notificationsQueries.list());

  const sessions = availabilityQuery.data?.sessions ?? [];

  // Filter sessions for selected day
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // --- Hero stats (computed from daySessions) ---
  // "Clients today" = total booked spots across today's sessions (unique bookings count)
  const clientsToday = daySessions.reduce((sum, s) => sum + s.bookedCount, 0);
  // "Hours tracked" = total duration of today's sessions in hours (1 decimal)
  const hoursToday = daySessions.reduce((sum, s) => {
    const mins = dayjs(s.endsAt).diff(dayjs(s.startsAt), "minute");
    return sum + mins;
  }, 0) / 60;
  const hoursDisplay = hoursToday > 0 ? hoursToday.toFixed(1) : "0";

  // Build activity map for WeekStrip
  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = "available";
  }

  // Map to TimeAxisDayView SessionBlock shape
  const timeAxisSessions: SessionBlock[] = daySessions.map((s) => ({
    id: s.id,
    startsAt: typeof s.startsAt === "string" ? s.startsAt : s.startsAt.toISOString(),
    endsAt: typeof s.endsAt === "string" ? s.endsAt : s.endsAt.toISOString(),
    classTypeName: s.classTypeName,
    roomName: s.roomName,
    bookedCount: s.bookedCount,
    capacity: s.capacity,
    status: s.availableSlots > 0 ? "available" : "full",
  }));

  function handleDateSelect(date: string) {
    // Selecting a day must NOT shift the visible week — `weekStart` is
    // owned by the parent and only changes via the arrow buttons.
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
    setSelectedDate(date);
    setWeekStart(startOfLocaleWeek(dayjs(date)));
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
    setScheduleTab("day");
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
    ]);
    setRefreshing(false);
  }

  function handleSessionPress(block: SessionBlock) {
    // Find the original session to get all detail fields
    const full = sessions.find((s) => s.id === block.id);
    if (!full) return;
    setSelectedSession({
      sessionId: full.id,
      classTypeName: full.classTypeName,
      roomName: full.roomName,
      bookedCount: full.bookedCount,
      capacity: full.capacity,
      availableSlots: full.availableSlots,
      startsAt: full.startsAt instanceof Date ? full.startsAt : new Date(full.startsAt),
      endsAt: full.endsAt instanceof Date ? full.endsAt : new Date(full.endsAt),
    });
  }

  const trainerName = meQuery.data?.user?.email ?? "";
  const greetingName = trainerName.split("@")[0] ?? trainerName;

  return (
    <ScreenContainerRaw title={t("tabs.schedule")}>
      {/* ── Greeting row ── */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: 0 }}
      >
        <View className="flex-row items-center justify-between px-6 pt-2 pb-1">
          <View className="flex-col gap-0.5">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 22, letterSpacing: -0.4 }}
            >
              {t("trainer.schedule.greeting", { name: greetingName, defaultValue: `Hello, ${greetingName}` })}
            </Text>
            <Text className="text-muted text-sm">
              {dayjs().format("dddd, D MMMM YYYY")}
            </Text>
          </View>
        </View>
      </MotiView>

      {/* ── Hero stats card ── */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: 80 }}
      >
        <View className="px-6 pb-3">
          <HeroCard tone="default">
            <View className="flex-col gap-3">
              <SectionLabel>{t("trainer.schedule.todayStats", { defaultValue: "Today's stats" })}</SectionLabel>
              <View className="flex-row justify-between">
                {/* Sessions today */}
                <View className="flex-col items-center gap-1 flex-1">
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 28, letterSpacing: -0.5 }}
                  >
                    {daySessions.length}
                  </Text>
                  <Text className="text-muted text-xs text-center">
                    {t("trainer.schedule.sessions", { defaultValue: "Sessions" })}
                  </Text>
                </View>
                {/* Divider */}
                <View className="w-px bg-glass-border self-stretch mx-1" />
                {/* Clients today */}
                <View className="flex-col items-center gap-1 flex-1">
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 28, letterSpacing: -0.5 }}
                  >
                    {clientsToday}
                  </Text>
                  <Text className="text-muted text-xs text-center">
                    {t("trainer.schedule.clients", { defaultValue: "Clients" })}
                  </Text>
                </View>
                {/* Divider */}
                <View className="w-px bg-glass-border self-stretch mx-1" />
                {/* Hours tracked */}
                <View className="flex-col items-center gap-1 flex-1">
                  <Text
                    className="text-foreground font-body-bold"
                    style={{ fontSize: 28, letterSpacing: -0.5 }}
                  >
                    {hoursDisplay}
                  </Text>
                  <Text className="text-muted text-xs text-center">
                    {t("trainer.schedule.hours", { defaultValue: "Hours" })}
                  </Text>
                </View>
              </View>
            </View>
          </HeroCard>
        </View>
      </MotiView>

      {/* ── View toggle ── */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: 160 }}
      >
        <View className="px-6 pb-3">
          <SegmentedControl<ScheduleTab>
            options={[
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
            ]}
            value={scheduleTab}
            onChange={setScheduleTab}
          />
        </View>
      </MotiView>

      {/* ── Error state ── */}
      {availabilityQuery.isError ? (
        <View className="px-6">
          <ErrorState message={t("trainer.schedule.error")} />
        </View>
      ) : null}

      {scheduleTab === "day" ? (
        <>
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400, delay: 200 }}
          >
            <View className="px-6 pb-3">
              <WeekStrip
                weekStart={weekStart}
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                activity={activityByDate}
              />
            </View>
          </MotiView>

          {/* ── Day label + session count ── */}
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 400, delay: 240 }}
          >
            <View className="px-6 pb-2 flex-row items-baseline justify-between">
              <SectionLabel>{displayDate.format("dddd, D MMMM")}</SectionLabel>
              {daySessions.length > 0 ? (
                <Text className="text-xs text-muted">
                  {daySessions.length} {t("trainer.schedule.sessionsLabel", { defaultValue: "sessions" })}
                </Text>
              ) : null}
            </View>
          </MotiView>

          {/* ── TimeAxisDayView or empty state ── */}
          {daySessions.length === 0 ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: bottomPad }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#2e5b42"
                  colors={["#2e5b42"]}
                />
              }
            >
              <EmptyState title={t("client.dayView.noSessions")} />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <TimeAxisDayView
                date={selectedDate}
                sessions={timeAxisSessions}
                onSessionPress={handleSessionPress}
                showNowLine={isToday}
              />
            </View>
          )}
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: bottomPad }}
        >
          <MonthView
            month={monthDate}
            selectedDate={selectedDate}
            onSelectDate={handleMonthCellSelect}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            activity={activityByDate}
          />
        </ScrollView>
      )}

      {/* ── Session detail sheet (kept verbatim) ── */}
      <AppSheet open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        {selectedSession ? (
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 24, letterSpacing: -0.3 }}
            >
              {selectedSession.classTypeName}
            </Text>
            <Card>
              <View className="flex-col gap-3">
                <ListRow
                  title={`${dayjs(selectedSession.startsAt).format("DD.MM.YYYY HH:mm")} - ${dayjs(selectedSession.endsAt).format("HH:mm")}`}
                  subtitle={`${t("trainer.schedule.room")}: ${selectedSession.roomName ?? "—"} · ${t("trainer.schedule.available")}: ${selectedSession.availableSlots}`}
                />
                <Badge status="neutral">
                  {selectedSession.bookedCount}/{selectedSession.capacity} {t("trainer.schedule.booked")}
                </Badge>
              </View>
            </Card>
          </View>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
