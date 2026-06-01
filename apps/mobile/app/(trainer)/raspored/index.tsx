/**
 * Trainer schedule (Pregled raspored) — Studio operations look.
 *
 * No photo hero — staff want signal, not atmosphere. Editorial stat
 * strip up top (Sessions / Clients / Hours), then the schedule list,
 * then optional month view. Same chrome (logo header + UserAvatar) as
 * the rest of the app; the difference is density.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MotiView } from "@/components/ui/styled";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  TimeAxisDayView,
  type SessionBlock,
} from "@/components/ui/time-axis-day-view";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { TrainerScheduleLeftSlot } from "@/components/trainer/trainer-tab-left-slot";
import { CapsLabel, StudioWeekStrip } from "@/components/ui/studio";
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

  // YYYY-MM-DD → number of sessions on that day (drives the dot indicator
  // under each StudioWeekStrip pill).
  const sessionsByDay = sessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // MonthView still expects the legacy "available"/"booked" map.
  const activityByDate: Record<string, "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = "available";
  }

  function handleDateSelect(d: dayjs.Dayjs) {
    const date = d.format("YYYY-MM-DD");
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(d);
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
    router.push(`/(trainer)/raspored/sessions/${session.id}` as Href);
  }

  const trainerName = meQuery.data?.user?.email ?? "";
  const greetingName = trainerName.split("@")[0] ?? trainerName;

  return (
    <ScreenContainerRaw title={t("tabs.schedule")} leftSlot={<TrainerScheduleLeftSlot />}>
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
          <View className="px-5 pb-5">
            <CapsLabel size={11} tracking={1.6} className="text-muted">
              {dayjs().locale(lang).format("dddd, D MMMM").toUpperCase()}
            </CapsLabel>
            <Text
              className="text-foreground font-body-bold mt-1.5"
              style={{ fontSize: 26, letterSpacing: -0.5, textTransform: "capitalize" }}
            >
              {t("trainer.schedule.greeting", { name: greetingName })}
            </Text>
          </View>
        </MotiView>

        {/* ── Today stats — editorial hairline strip ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 80 }}
        >
          <View className="mx-5 mb-6 flex-row">
            <StatColumn
              label={t("trainer.schedule.sessions")}
              value={daySessions.length}
            />
            <View className="bg-glass-border" style={{ width: 1, marginVertical: 10 }} />
            <StatColumn
              label={t("trainer.schedule.clients")}
              value={clientsToday}
            />
            <View className="bg-glass-border" style={{ width: 1, marginVertical: 10 }} />
            <StatColumn
              label={t("trainer.schedule.hours")}
              value={hoursDisplay}
              accent
            />
          </View>
        </MotiView>

        {/* ── Schedule section ── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 160 }}
        >
          <View className="px-5 pb-4">
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
                  <ErrorState message={t("trainer.schedule.error")} />
                </View>
              ) : null}

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
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                activity={activityByDate}
              />
            </View>
          )}
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}

// ─── editorial stat column (matches client/profile pattern) ──────────────

function StatColumn({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  // Empty data renders an em-dash so the strip stays elegant on quiet days.
  const display =
    typeof value === "number"
      ? value === 0
        ? "—"
        : String(value)
      : value === "0"
        ? "—"
        : value;
  return (
    <View className="flex-1 items-center py-4 px-2 gap-1.5">
      <Text
        className={accent ? "text-accent" : "text-muted"}
        style={{
          fontFamily: "AlbertSans-SemiBold",
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        className={accent ? "text-accent" : "text-foreground"}
        style={{
          fontFamily: "AlbertSans-Bold",
          fontSize: 26,
          letterSpacing: -0.6,
          lineHeight: 30,
        }}
      >
        {display}
      </Text>
    </View>
  );
}
