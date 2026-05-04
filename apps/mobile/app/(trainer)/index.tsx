/**
 * Trainer schedule screen — mirrors the admin schedule layout (P3 polish):
 * single vertical ScrollView with greeting + hero stats + view toggle +
 * WeekStrip/MonthView + session list. Tapping a session opens a read-only
 * detail sheet (trainers cannot edit sessions).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { ListRow, EmptyState, ErrorState } from "@/components/ui/states";
import { WeekStrip, startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { HeroCard } from "@/components/ui/hero-card";
import { SessionCard } from "@/components/ui/session-card";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

type ScheduleTab = "day" | "month";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function TrainerSchedule() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding(24);
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

  const displayDate = dayjs(selectedDate);

  const meQuery = useQuery(authQueries.me());
  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));

  const sessions = availabilityQuery.data?.sessions ?? [];

  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // Hero stats — sessions, booked clients, hours.
  const clientsToday = daySessions.reduce((sum, s) => sum + s.bookedCount, 0);
  const minsToday = daySessions.reduce((sum, s) => {
    return sum + dayjs(s.endsAt).diff(dayjs(s.startsAt), "minute");
  }, 0);
  const hoursToday = minsToday / 60;
  const hoursDisplay = hoursToday > 0 ? hoursToday.toFixed(1) : "0";

  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = "available";
  }

  function handleDateSelect(date: string) {
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

  function handleEventPress(session: typeof sessions[0]) {
    setSelectedSession({
      sessionId: session.id,
      classTypeName: session.classTypeName,
      roomName: session.roomName,
      bookedCount: session.bookedCount,
      capacity: session.capacity,
      availableSlots: session.availableSlots,
      startsAt: session.startsAt instanceof Date
        ? session.startsAt
        : new Date(session.startsAt),
      endsAt: session.endsAt instanceof Date
        ? session.endsAt
        : new Date(session.endsAt),
    });
  }

  const trainerName = meQuery.data?.user?.email ?? "";
  const greetingName = trainerName.split("@")[0] ?? trainerName;

  return (
    <ScreenContainerRaw title={t("tabs.schedule")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomPad }}
      >
        {/* ── Greeting ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <View className="px-6 pb-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 22, letterSpacing: -0.4 }}
            >
              {t("trainer.schedule.greeting", { name: greetingName })}
            </Text>
            <Text className="text-muted text-sm mt-0.5">
              {dayjs().locale(lang).format("dddd, D MMMM YYYY")}
            </Text>
          </View>
        </MotiView>

        {/* ── Today stats hero ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 80 }}
        >
          <View className="px-6 pb-4">
            <HeroCard tone="default">
              <View className="flex-col gap-3">
                <SectionLabel>{t("trainer.schedule.todayStats")}</SectionLabel>
                <View className="flex-row justify-between">
                  <View className="flex-col items-center gap-1 flex-1">
                    <Text
                      className="text-foreground font-body-bold"
                      style={{ fontSize: 28, letterSpacing: -0.5 }}
                    >
                      {daySessions.length}
                    </Text>
                    <Text className="text-muted text-xs text-center">
                      {t("trainer.schedule.sessions")}
                    </Text>
                  </View>
                  <View className="w-px bg-glass-border self-stretch mx-1" />
                  <View className="flex-col items-center gap-1 flex-1">
                    <Text
                      className="text-foreground font-body-bold"
                      style={{ fontSize: 28, letterSpacing: -0.5 }}
                    >
                      {clientsToday}
                    </Text>
                    <Text className="text-muted text-xs text-center">
                      {t("trainer.schedule.clients")}
                    </Text>
                  </View>
                  <View className="w-px bg-glass-border self-stretch mx-1" />
                  <View className="flex-col items-center gap-1 flex-1">
                    <Text
                      className="text-foreground font-body-bold"
                      style={{ fontSize: 28, letterSpacing: -0.5 }}
                    >
                      {hoursDisplay}
                    </Text>
                    <Text className="text-muted text-xs text-center">
                      {t("trainer.schedule.hours")}
                    </Text>
                  </View>
                </View>
              </View>
            </HeroCard>
          </View>
        </MotiView>

        {/* ── Schedule section ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 160 }}
        >
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

              {availabilityQuery.isError ? (
                <View className="px-6">
                  <ErrorState message={t("trainer.schedule.error")} />
                </View>
              ) : null}

              <View className="px-6">
                <View className="flex-row items-baseline justify-between pb-3">
                  <SectionLabel>
                    {displayDate.locale(lang).format("dddd, D MMMM")}
                  </SectionLabel>
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
                    daySessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
                        className={session.classTypeName}
                        trainerName={session.trainerName ?? undefined}
                        room={session.roomName ?? undefined}
                        bookedCount={session.bookedCount}
                        capacity={session.capacity}
                        status={
                          session.availableSlots > 0 ? "available" : "full"
                        }
                        onPress={() => handleEventPress(session)}
                      />
                    ))
                  )}
                </View>
              </View>
            </>
          ) : (
            <View className="px-6">
              <MonthView
                month={monthDate}
                selectedDate={selectedDate}
                onSelectDate={handleMonthCellSelect}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                activity={activityByDate}
              />
            </View>
          )}
        </MotiView>
      </ScrollView>

      {/* ── Session detail sheet (trainer is read-only) ── */}
      <AppSheet
        open={!!selectedSession}
        onOpenChange={() => setSelectedSession(null)}
      >
        {selectedSession ? (
          <View className="flex-col gap-4 pb-5">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 22, letterSpacing: -0.3 }}
            >
              {selectedSession.classTypeName}
            </Text>
            <Card>
              <View className="flex-col gap-3">
                <ListRow
                  title={`${dayjs(selectedSession.startsAt).format("DD.MM.YYYY HH:mm")} – ${dayjs(selectedSession.endsAt).format("HH:mm")}`}
                  subtitle={`${t("trainer.schedule.room")}: ${selectedSession.roomName ?? "—"} · ${t("trainer.schedule.available")}: ${selectedSession.availableSlots}`}
                />
                <Badge status="neutral">
                  {selectedSession.bookedCount}/{selectedSession.capacity}{" "}
                  {t("trainer.schedule.booked")}
                </Badge>
              </View>
            </Card>
          </View>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
