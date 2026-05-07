import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SessionCard } from "@/components/ui/session-card";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import {
  SkeletonCard,
  SkeletonList,
  SkeletonStatCard,
} from "@/components/ui/skeleton";
import { useThemeTokens } from "@/components/ui/tokens";
import { CapsLabel, StudioWeekStrip, StatStrip } from "@/components/ui/studio";
import { HeaderIconButton } from "@/components/ui/app-header";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import { applySessionFormChange } from "@/lib/admin/session-form-state";

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
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [monthDate, setMonthDate] = useState(() => dayjs().startOf("month"));
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("day");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<{
    sessionId: string;
    classTypeName: string;
    roomName: string | null;
    bookedCount: number;
    capacity: number;
    availableSlots: number;
    waitlistCount: number;
    startsAt: Date;
    endsAt: Date;
    recurringScheduleId: string | null;
    isActive: boolean;
  } | null>(null);
  const [editScope, setEditScope] = useState<"session" | "series">("session");
  const [isRecurring, setIsRecurring] = useState(false);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState(false);
  const [confirmCancelSession, setConfirmCancelSession] = useState(false);
  const [createIsActive, setCreateIsActive] = useState(true);

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );
  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const roomsQuery = useQuery(roomsQueries.list());
  const trainersQuery = useQuery(usersQueries.trainers());
  const summaryQuery = useQuery(reportsQueries.summary());
  const summary = summaryQuery.data?.summary;

  const [newSession, setNewSession] = useState<{
    classTypeId: string;
    roomId: string;
    trainerUserId: string;
    startsAt: Date | null;
    endsAt: Date | null;
    capacity: string;
    durationMins: string;
    weekCount: string;
    weekdays: number[];
  }>({
    classTypeId: "",
    roomId: "",
    trainerUserId: "",
    startsAt: null,
    endsAt: null,
    capacity: "",
    durationMins: "",
    weekCount: "",
    weekdays: [],
  });
  const [editForm, setEditForm] = useState<{
    startsAt: Date | null;
    endsAt: Date | null;
    capacity: string;
    roomId: string;
    trainerUserId: string;
    status: string;
    isActive: boolean;
  }>({
    startsAt: null,
    endsAt: null,
    capacity: "",
    roomId: "",
    trainerUserId: "",
    status: "SCHEDULED",
    isActive: true,
  });

  const createMutation = useMutation({
    ...sessionsQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowCreate(false);
      resetCreateForm();
    },
  });
  const createRecurringMutation = useMutation({
    ...sessionsQueries.createRecurring(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowCreate(false);
      resetCreateForm();
    },
  });
  const updateMutation = useMutation({
    ...sessionsQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setConfirmCancelSession(false);
      setShowEdit(null);
    },
  });
  const updateSeriesMutation = useMutation({
    ...sessionsQueries.updateRecurring(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowEdit(null);
    },
  });
  const deleteSeriesMutation = useMutation({
    ...sessionsQueries.deleteRecurring(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setConfirmDeleteSeries(false);
      setShowEdit(null);
    },
  });

  const scheduleQuery = useQuery(
    sessionsQueries.recurringSchedule(showEdit?.recurringScheduleId ?? null),
  );
  const [seriesForm, setSeriesForm] = useState<{
    weekdays: number[];
    timeOfDayMins: string;
    durationMins: string;
    capacity: string;
    roomId: string;
    trainerUserId: string;
    weekCount: string;
    isActive: boolean;
  }>({
    weekdays: [],
    timeOfDayMins: "",
    durationMins: "",
    capacity: "",
    roomId: "",
    trainerUserId: "",
    weekCount: "",
    isActive: true,
  });

  const scheduleData = scheduleQuery.data?.schedule;
  const futureBookingsCount = scheduleQuery.data?.futureBookingsCount ?? 0;
  const lastLoadedScheduleIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!scheduleData) return;
    if (lastLoadedScheduleIdRef.current === scheduleData.id) return;
    lastLoadedScheduleIdRef.current = scheduleData.id;
    setSeriesForm({
      weekdays: [...scheduleData.weekdays].sort((a, b) => a - b),
      timeOfDayMins: String(scheduleData.timeOfDayMins),
      durationMins: String(scheduleData.durationMins),
      capacity: String(scheduleData.capacity),
      roomId: scheduleData.roomId ?? "",
      trainerUserId: scheduleData.trainerUserId ?? "",
      weekCount: "",
      isActive: scheduleData.isActive,
    });
  }, [scheduleData]);

  function resetCreateForm() {
    setNewSession({
      classTypeId: "",
      roomId: "",
      trainerUserId: "",
      startsAt: null,
      endsAt: null,
      capacity: "",
      durationMins: "",
      weekCount: "",
      weekdays: [],
    });
    setIsRecurring(false);
    setCreateIsActive(true);
  }

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
    const sessionIsActive = session.isActive ?? true;
    setEditForm({
      startsAt: new Date(session.startsAt),
      endsAt: new Date(session.endsAt),
      capacity: String(session.capacity),
      roomId: session.roomId ?? "",
      trainerUserId: session.trainerUserId ?? "",
      status: "SCHEDULED",
      isActive: sessionIsActive,
    });
    setShowEdit({
      sessionId: session.id,
      classTypeName: session.classTypeName,
      roomName: session.roomName,
      bookedCount: session.bookedCount,
      capacity: session.capacity,
      availableSlots: session.availableSlots,
      waitlistCount: session.waitlistCount,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      recurringScheduleId: session.recurringScheduleId ?? null,
      isActive: sessionIsActive,
    });
    setEditScope("session");
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
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.schedule.newSession")}
          testID="admin-new-session-button"
        />
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
              onPress={() => router.push("/(admin)/class-types")}
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
              onPress={() => router.push("/(admin)/rooms")}
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
                    daySessions.map((session) => (
                      <SessionCard
                        key={session.id}
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

      {/* Create Session Sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-5 pb-5">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {isRecurring
                ? t("admin.schedule.sheetRecurring")
                : t("admin.schedule.sheetNew")}
            </Text>
            <View className="flex-row gap-2">
              <Button
                testID="session-create-mode-once"
                className="flex-1"
                size="small"
                variant={!isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(false)}
              >
                {t("admin.schedule.once")}
              </Button>
              <Button
                testID="session-create-mode-recurring"
                className="flex-1"
                size="small"
                variant={isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(true)}
              >
                {t("admin.schedule.recurring")}
              </Button>
            </View>

            <Select
              testID="session-create-class-type-select"
              optionTestIDPrefix="session-create-class-type-option"
              placeholder={t("admin.schedule.classType")}
              value={newSession.classTypeId}
              onChange={(v) => {
                setNewSession((s) =>
                  applySessionFormChange(
                    s,
                    { field: "classTypeId", value: v },
                    {
                      classTypes: classTypesQuery.data?.classTypes ?? [],
                      rooms: roomsQuery.data?.rooms ?? [],
                    },
                  ),
                );
              }}
              emptyText={t("admin.schedule.emptyClassTypes")}
              options={(classTypesQuery.data?.classTypes ?? []).map((ct) => ({
                value: ct.id,
                label: ct.name,
                hint: `${ct.durationMins} min · ${ct.maxClients} ${t("admin.schedule.maxClientsHint")}`,
              }))}
            />

            <Select
              testID="session-create-room-select"
              optionTestIDPrefix="session-create-room-option"
              placeholder={t("admin.schedule.room")}
              value={newSession.roomId}
              onChange={(v) =>
                setNewSession((s) =>
                  applySessionFormChange(
                    s,
                    { field: "roomId", value: v },
                    {
                      classTypes: classTypesQuery.data?.classTypes ?? [],
                      rooms: roomsQuery.data?.rooms ?? [],
                    },
                  ),
                )
              }
              emptyText={t("admin.schedule.emptyRooms")}
              options={(roomsQuery.data?.rooms ?? []).map((room) => ({
                value: room.id,
                label: room.name,
                hint: t("admin.schedule.roomCap", {
                  name: room.name,
                  capacity: room.capacity,
                }),
              }))}
            />

            <Select
              testID="session-create-trainer-select"
              optionTestIDPrefix="session-create-trainer-option"
              placeholder={t("admin.schedule.trainer")}
              value={newSession.trainerUserId}
              onChange={(v) =>
                setNewSession((s) => ({ ...s, trainerUserId: v }))
              }
              emptyText={t("admin.schedule.emptyTrainers")}
              options={(trainersQuery.data?.users ?? []).map((u) => ({
                value: u.id,
                label: u.fullName,
              }))}
            />

            <DateTimePicker
              testID="session-create-startsAt"
              placeholder={t("admin.schedule.placeholderStart")}
              value={newSession.startsAt}
              onChange={(date) =>
                setNewSession((s) => ({ ...s, startsAt: date }))
              }
              mode="datetime"
              minimumDate={new Date()}
            />

            <Input
              placeholder={t("admin.schedule.placeholderDuration")}
              keyboardType="numeric"
              value={newSession.durationMins}
              onChangeText={(v) =>
                setNewSession((s) => ({ ...s, durationMins: v }))
              }
            />

            {isRecurring ? (
              <>
                <Input
                  testID="session-create-week-count-input"
                  placeholder={t("admin.schedule.placeholderWeekCount")}
                  keyboardType="numeric"
                  value={newSession.weekCount}
                  onChangeText={(v) =>
                    setNewSession((s) => ({ ...s, weekCount: v }))
                  }
                />
                <View className="gap-2">
                  <SectionLabel>
                    {t("admin.schedule.weekdaysLabel")}
                  </SectionLabel>
                  <View className="flex-row gap-2">
                    {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                      const selected = newSession.weekdays.includes(dow);
                      return (
                        <Pressable
                          key={dow}
                          testID={`session-create-weekday-${dow}`}
                          onPress={() =>
                            setNewSession((s) => ({
                              ...s,
                              weekdays: selected
                                ? s.weekdays.filter((d) => d !== dow)
                                : [...s.weekdays, dow],
                            }))
                          }
                          className={`flex-1 h-12 rounded-2xl border items-center justify-center ${
                            selected
                              ? "border-accent bg-accent"
                              : "border-glass-border bg-glass"
                          }`}
                        >
                          <Text
                            className={`text-sm font-body-semibold ${
                              selected ? "text-white" : "text-foreground"
                            }`}
                          >
                            {t(`admin.schedule.weekday${dow}Short` as never)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}

            <Input
              placeholder={t("admin.schedule.placeholderCapacity")}
              keyboardType="numeric"
              value={newSession.capacity}
              onChangeText={(v) =>
                setNewSession((s) => ({ ...s, capacity: v }))
              }
            />

            <View className="flex-row items-center justify-between px-1 py-1">
              <Text className="text-sm text-muted">
                {t("admin.schedule.visibleToClients")}
              </Text>
              <Switch
                value={createIsActive}
                onValueChange={setCreateIsActive}
                trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
                style={{ transform: [{ scale: 0.85 }] }}
              />
            </View>
            <Button
              testID="session-create-submit"
              disabled={
                (isRecurring
                  ? createRecurringMutation.isPending
                  : createMutation.isPending) ||
                !newSession.classTypeId ||
                !newSession.trainerUserId ||
                !newSession.startsAt ||
                !newSession.capacity ||
                !newSession.durationMins ||
                (isRecurring
                  ? !newSession.weekCount || newSession.weekdays.length === 0
                  : false)
              }
              onPress={() => {
                if (!newSession.startsAt) return;
                if (!newSession.trainerUserId) return;
                const capacity = parseInt(newSession.capacity, 10);
                if (!Number.isFinite(capacity) || capacity <= 0) return;
                const durationMins = parseInt(newSession.durationMins, 10);
                if (!Number.isFinite(durationMins) || durationMins <= 0) return;
                if (isRecurring) {
                  const weekCount = parseInt(newSession.weekCount, 10);
                  if (
                    !Number.isFinite(weekCount) ||
                    newSession.weekdays.length === 0
                  )
                    return;
                  createRecurringMutation.mutate({
                    classTypeId: newSession.classTypeId,
                    roomId: newSession.roomId || undefined,
                    trainerUserId: newSession.trainerUserId,
                    startsAt: newSession.startsAt.toISOString(),
                    durationMins,
                    capacity,
                    weekCount,
                    weekdays: newSession.weekdays,
                    isActive: createIsActive,
                  });
                } else {
                  const endsAt = new Date(
                    newSession.startsAt.getTime() + durationMins * 60 * 1000,
                  );
                  createMutation.mutate({
                    classTypeId: newSession.classTypeId,
                    roomId: newSession.roomId || undefined,
                    trainerUserId: newSession.trainerUserId,
                    startsAt: newSession.startsAt.toISOString(),
                    endsAt: endsAt.toISOString(),
                    capacity,
                    isActive: createIsActive,
                  });
                }
              }}
            >
              {t("admin.manage.create")}
            </Button>
            {createMutation.isError || createRecurringMutation.isError ? (
              <ErrorState
                testID="session-create-error"
                message={t("admin.schedule.createError")}
              />
            ) : null}
        </View>
      </AppSheet>

      {/* Edit Session Sheet */}
      <AppSheet open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <View className="flex-col gap-5 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {showEdit
              ? t("admin.schedule.editTitle", {
                  name: showEdit.classTypeName,
                })
              : ""}
          </Text>
          {showEdit ? (
            <Card>
              <ListRow
                title={t("admin.schedule.bookedCount", {
                  booked: showEdit.bookedCount,
                  capacity: showEdit.capacity,
                })}
                subtitle={`${t("client.calendar.room")}: ${showEdit.roomName ?? "—"} · ${t("admin.schedule.waitlistShort", { count: showEdit.waitlistCount })}`}
              />
            </Card>
          ) : null}

          {showEdit?.recurringScheduleId ? (
            <View className="flex-row gap-2">
              <Button
                testID="session-edit-scope-session"
                className="flex-1"
                size="small"
                variant={editScope === "session" ? "primary" : "secondary"}
                onPress={() => setEditScope("session")}
              >
                {t("admin.schedule.editScopeSession")}
              </Button>
              <Button
                testID="session-edit-scope-series"
                className="flex-1"
                size="small"
                variant={editScope === "series" ? "primary" : "secondary"}
                onPress={() => setEditScope("series")}
              >
                {t("admin.schedule.editScopeSeries")}
              </Button>
            </View>
          ) : null}

          {editScope === "session" || !showEdit?.recurringScheduleId ? (
            <>
              <DateTimePicker
                placeholder={t("admin.schedule.placeholderStart")}
                value={editForm.startsAt}
                onChange={(date) =>
                  setEditForm((s) => ({ ...s, startsAt: date }))
                }
                mode="datetime"
              />
              <DateTimePicker
                placeholder={t("admin.schedule.placeholderEnd")}
                value={editForm.endsAt}
                onChange={(date) =>
                  setEditForm((s) => ({ ...s, endsAt: date }))
                }
                mode="datetime"
                minimumDate={editForm.startsAt ?? undefined}
              />
              <Input
                placeholder={t("admin.schedule.placeholderCapacity")}
                keyboardType="numeric"
                value={editForm.capacity}
                onChangeText={(v) =>
                  setEditForm((s) => ({ ...s, capacity: v }))
                }
              />
              <Select
                placeholder={t("admin.schedule.trainer")}
                value={editForm.trainerUserId}
                onChange={(v) =>
                  setEditForm((s) => ({ ...s, trainerUserId: v }))
                }
                emptyText={t("admin.schedule.emptyTrainers")}
                options={(trainersQuery.data?.users ?? []).map((u) => ({
                  value: u.id,
                  label: u.fullName,
                }))}
              />
              <Select
                placeholder={t("admin.schedule.room")}
                value={editForm.roomId}
                onChange={(v) =>
                  setEditForm((s) => {
                    const room = (roomsQuery.data?.rooms ?? []).find((r) => r.id === v);
                    return {
                      ...s,
                      roomId: v,
                      capacity: room ? String(room.capacity) : s.capacity,
                    };
                  })
                }
                emptyText={t("admin.schedule.emptyRooms")}
                options={(roomsQuery.data?.rooms ?? []).map((room) => ({
                  value: room.id,
                  label: room.name,
                  hint: t("admin.schedule.roomCap", {
                    name: room.name,
                    capacity: room.capacity,
                  }),
                }))}
              />

              {(() => {
                const cannotHide =
                  editForm.isActive &&
                  !showEdit?.recurringScheduleId &&
                  (showEdit?.bookedCount ?? 0) > 0;
                return (
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between px-1 py-1">
                      <Text className="text-sm text-muted">
                        {t("admin.schedule.visibleToClients")}
                      </Text>
                      <Switch
                        value={editForm.isActive}
                        onValueChange={(v) =>
                          setEditForm((s) => ({ ...s, isActive: v }))
                        }
                        disabled={cannotHide}
                        trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
                        style={{ transform: [{ scale: 0.85 }] }}
                      />
                    </View>
                    {cannotHide ? (
                      <Text className="text-xs text-muted px-1">
                        {t("admin.schedule.hideBlockedSession")}
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

              <Button
                testID="session-edit-save-button"
                disabled={
                  updateMutation.isPending ||
                  !editForm.trainerUserId
                }
                onPress={() => {
                  if (!showEdit) return;
                  if (!editForm.trainerUserId) return;
                  updateMutation.mutate({
                    id: showEdit.sessionId,
                    startsAt: editForm.startsAt?.toISOString(),
                    endsAt: editForm.endsAt?.toISOString(),
                    capacity: editForm.capacity
                      ? parseInt(editForm.capacity, 10)
                      : undefined,
                    roomId: editForm.roomId || undefined,
                    trainerUserId: editForm.trainerUserId,
                    isActive: editForm.isActive,
                  });
                }}
              >
                {t("admin.schedule.saveChanges")}
              </Button>
              <Button
                testID="session-edit-cancel-button"
                variant="danger"
                disabled={updateMutation.isPending}
                onPress={() => setConfirmCancelSession(true)}
              >
                {t("admin.schedule.cancelSession")}
              </Button>
              {updateMutation.isError ? (
                <ErrorState
                  message={
                    (updateMutation.error as Error)?.message ??
                    t("admin.schedule.updateError")
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              <View className="gap-2">
                <SectionLabel>
                  {t("admin.schedule.weekdaysLabel")}
                </SectionLabel>
                <View className="flex-row gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const selected = seriesForm.weekdays.includes(dow);
                    return (
                      <Pressable
                        key={dow}
                        testID={`series-edit-weekday-${dow}`}
                        onPress={() =>
                          setSeriesForm((s) => ({
                            ...s,
                            weekdays: selected
                              ? s.weekdays.filter((d) => d !== dow)
                              : [...s.weekdays, dow],
                          }))
                        }
                        className={`flex-1 h-12 rounded-2xl border items-center justify-center ${
                          selected
                            ? "border-accent bg-accent"
                            : "border-glass-border bg-glass"
                        }`}
                      >
                        <Text
                          className={`text-base font-body-semibold ${
                            selected ? "text-white" : "text-foreground"
                          }`}
                        >
                          {t(`admin.schedule.weekday${dow}Short` as never)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Input
                placeholder={t("admin.schedule.placeholderTimeOfDay")}
                keyboardType="numeric"
                value={
                  seriesForm.timeOfDayMins === ""
                    ? ""
                    : (() => {
                        const m = parseInt(seriesForm.timeOfDayMins, 10);
                        if (!Number.isFinite(m)) return seriesForm.timeOfDayMins;
                        const hh = String(Math.floor(m / 60)).padStart(2, "0");
                        const mm = String(m % 60).padStart(2, "0");
                        return `${hh}:${mm}`;
                      })()
                }
                onChangeText={(v) => {
                  const trimmed = v.trim();
                  if (trimmed === "") {
                    setSeriesForm((s) => ({ ...s, timeOfDayMins: "" }));
                    return;
                  }
                  const match = trimmed.match(/^(\d{1,2}):?(\d{0,2})$/);
                  if (!match) return;
                  const hh = parseInt(match[1] ?? "0", 10);
                  const mm = parseInt(match[2] || "0", 10);
                  if (hh > 23 || mm > 59) return;
                  setSeriesForm((s) => ({
                    ...s,
                    timeOfDayMins: String(hh * 60 + mm),
                  }));
                }}
              />
              <Input
                placeholder={t("admin.schedule.placeholderDuration")}
                keyboardType="numeric"
                value={seriesForm.durationMins}
                onChangeText={(v) =>
                  setSeriesForm((s) => ({ ...s, durationMins: v }))
                }
              />
              <Input
                placeholder={t("admin.schedule.placeholderCapacity")}
                keyboardType="numeric"
                value={seriesForm.capacity}
                onChangeText={(v) =>
                  setSeriesForm((s) => ({ ...s, capacity: v }))
                }
              />
              <Select
                placeholder={t("admin.schedule.trainer")}
                value={seriesForm.trainerUserId}
                onChange={(v) =>
                  setSeriesForm((s) => ({ ...s, trainerUserId: v }))
                }
                emptyText={t("admin.schedule.emptyTrainers")}
                options={(trainersQuery.data?.users ?? []).map((u) => ({
                  value: u.id,
                  label: u.fullName,
                }))}
              />
              <Select
                placeholder={t("admin.schedule.room")}
                value={seriesForm.roomId}
                onChange={(v) =>
                  setSeriesForm((s) => {
                    const room = (roomsQuery.data?.rooms ?? []).find((r) => r.id === v);
                    return {
                      ...s,
                      roomId: v,
                      capacity: room ? String(room.capacity) : s.capacity,
                    };
                  })
                }
                emptyText={t("admin.schedule.emptyRooms")}
                options={(roomsQuery.data?.rooms ?? []).map((room) => ({
                  value: room.id,
                  label: room.name,
                  hint: t("admin.schedule.roomCap", {
                    name: room.name,
                    capacity: room.capacity,
                  }),
                }))}
              />
              <Input
                placeholder={t("admin.schedule.placeholderWeekCountOptional")}
                keyboardType="numeric"
                value={seriesForm.weekCount}
                onChangeText={(v) =>
                  setSeriesForm((s) => ({ ...s, weekCount: v }))
                }
              />

              {(() => {
                const cannotHide =
                  seriesForm.isActive && futureBookingsCount > 0;
                return (
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between px-1 py-1">
                      <Text className="text-sm text-muted">
                        {t("admin.schedule.visibleToClients")}
                      </Text>
                      <Switch
                        value={seriesForm.isActive}
                        onValueChange={(v) =>
                          setSeriesForm((s) => ({ ...s, isActive: v }))
                        }
                        disabled={cannotHide}
                        trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
                        style={{ transform: [{ scale: 0.85 }] }}
                      />
                    </View>
                    {cannotHide ? (
                      <Text className="text-xs text-muted px-1">
                        {t("admin.schedule.hideBlockedSeries", {
                          count: futureBookingsCount,
                        })}
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

              <Button
                testID="series-edit-save-button"
                disabled={
                  updateSeriesMutation.isPending ||
                  !showEdit?.recurringScheduleId ||
                  seriesForm.weekdays.length === 0 ||
                  !seriesForm.trainerUserId
                }
                onPress={() => {
                  if (!showEdit?.recurringScheduleId) return;
                  if (!seriesForm.trainerUserId) return;
                  const timeOfDayMins = seriesForm.timeOfDayMins
                    ? parseInt(seriesForm.timeOfDayMins, 10)
                    : undefined;
                  const durationMins = seriesForm.durationMins
                    ? parseInt(seriesForm.durationMins, 10)
                    : undefined;
                  const capacity = seriesForm.capacity
                    ? parseInt(seriesForm.capacity, 10)
                    : undefined;
                  const weekCount = seriesForm.weekCount
                    ? parseInt(seriesForm.weekCount, 10)
                    : undefined;
                  updateSeriesMutation.mutate({
                    id: showEdit.recurringScheduleId,
                    weekdays: seriesForm.weekdays,
                    timeOfDayMins,
                    durationMins,
                    capacity,
                    roomId: seriesForm.roomId || null,
                    trainerUserId: seriesForm.trainerUserId,
                    isActive: seriesForm.isActive,
                    weekCount,
                  });
                }}
              >
                {t("admin.schedule.saveSeriesChanges")}
              </Button>
              <Button
                testID="series-edit-delete-button"
                variant="danger"
                disabled={
                  deleteSeriesMutation.isPending ||
                  !showEdit?.recurringScheduleId
                }
                onPress={() => setConfirmDeleteSeries(true)}
              >
                {t("admin.schedule.deleteSeries")}
              </Button>
              {updateSeriesMutation.isError ? (
                <ErrorState
                  message={
                    (updateSeriesMutation.error as Error)?.message ??
                    t("admin.schedule.updateError")
                  }
                />
              ) : null}
            </>
          )}
        </View>
      </AppSheet>
      <ConfirmSheet
        testID="series-delete-confirm-button"
        open={confirmDeleteSeries}
        onOpenChange={setConfirmDeleteSeries}
        title={t("confirm.deleteSeriesTitle")}
        message={t("confirm.deleteSeriesMessage")}
        confirmLabel={t("confirm.deleteSeriesConfirm")}
        loading={deleteSeriesMutation.isPending}
        errorMessage={
          deleteSeriesMutation.isError
            ? (deleteSeriesMutation.error as Error)?.message ??
              t("admin.schedule.updateError")
            : null
        }
        onConfirm={() => {
          if (!showEdit?.recurringScheduleId) return;
          deleteSeriesMutation.mutate(showEdit.recurringScheduleId);
        }}
      />
      <ConfirmSheet
        testID="session-cancel-confirm-button"
        open={confirmCancelSession}
        onOpenChange={setConfirmCancelSession}
        title={t("confirm.cancelSessionTitle")}
        message={t("confirm.cancelSessionMessage")}
        confirmLabel={t("confirm.cancelSessionConfirm")}
        loading={updateMutation.isPending}
        errorMessage={
          updateMutation.isError && confirmCancelSession
            ? (updateMutation.error as Error)?.message ??
              t("admin.schedule.updateError")
            : null
        }
        onConfirm={() => {
          if (!showEdit) return;
          updateMutation.mutate({
            id: showEdit.sessionId,
            status: "CANCELED",
          });
        }}
      />
    </ScreenContainerRaw>
  );
}

