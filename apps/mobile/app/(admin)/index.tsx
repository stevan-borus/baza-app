import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import dayjs from "dayjs";
import { MotiView } from "@/components/ui/styled";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { StatTile } from "@/components/ui/stat-tile";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SessionCard } from "@/components/ui/session-card";
import { WeekStrip, startOfLocaleWeek } from "@/components/ui/week-strip";
import { MonthView } from "@/components/ui/month-view";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import {
  SkeletonCard,
  SkeletonList,
  SkeletonStatCard,
} from "@/components/ui/skeleton";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
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
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
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
  } | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );
  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const roomsQuery = useQuery(roomsQueries.list());
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
    repeatCount: string;
    repeatEveryDays: string;
  }>({
    classTypeId: "",
    roomId: "",
    trainerUserId: "",
    startsAt: null,
    endsAt: null,
    capacity: "8",
    durationMins: "60",
    repeatCount: "4",
    repeatEveryDays: "7",
  });
  const [editForm, setEditForm] = useState<{
    startsAt: Date | null;
    endsAt: Date | null;
    capacity: string;
    roomId: string;
    trainerUserId: string;
    status: string;
  }>({
    startsAt: null,
    endsAt: null,
    capacity: "",
    roomId: "",
    trainerUserId: "",
    status: "SCHEDULED",
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
      setShowEdit(null);
    },
  });

  function resetCreateForm() {
    setNewSession({
      classTypeId: "",
      roomId: "",
      trainerUserId: "",
      startsAt: null,
      endsAt: null,
      capacity: "8",
      durationMins: "60",
      repeatCount: "4",
      repeatEveryDays: "7",
    });
    setIsRecurring(false);
  }

  const sessions = availabilityQuery.data?.sessions ?? [];

  // Filter sessions for selected day
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // Build activity map for WeekStrip
  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = "available";
  }

  function handleDateSelect(date: string) {
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
    setEditForm({
      startsAt: new Date(session.startsAt),
      endsAt: new Date(session.endsAt),
      capacity: String(session.capacity),
      roomId: "",
      trainerUserId: "",
      status: "SCHEDULED",
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
    });
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
    <ScreenContainerRaw title={t("tabs.dashboard")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomPad }}
      >
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          {/* ── Revenue hero card ───────────────────────────────────── */}
          <View className="px-6 pb-4">
            <HeroCard tone="default">
              <SectionLabel className="mb-2">{t("admin.dashboard.revenueThisMonth")}</SectionLabel>
              <NumberRollup
                value={revenueValue}
                formatter={(n) =>
                  `RSD ${Math.round(n).toLocaleString("sr-RS")}`
                }
                className="text-foreground font-body-bold"
                style={{ fontSize: 44, letterSpacing: -1 }}
              />
            </HeroCard>
          </View>
        </MotiView>

        {/* ── 2×2 Stat grid ──────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 120 }}
        >
          <View className="px-6 pb-4 gap-3">
            {/* Row 1 */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <StatTile
                  label={t("admin.dashboard.sessionsToday")}
                  value={daySessions.length}
                />
              </View>
              <View className="flex-1">
                <StatTile
                  label={t("admin.dashboard.activeClients")}
                  value={summary?.activeClients ?? "—"}
                />
              </View>
            </View>
            {/* Row 2 */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <StatTile
                  label={t("admin.dashboard.newClientsMonth")}
                  value={
                    summary
                      ? summary.totalClients - summary.inactiveClients
                      : "—"
                  }
                />
              </View>
              <View className="flex-1">
                <StatTile
                  label={t("admin.dashboard.attendanceRate")}
                  value={summary ? `${attendanceRate}%` : "—"}
                />
              </View>
            </View>
          </View>
        </MotiView>

        {/* ── Studio quick-actions: 2 compact pills above the schedule ─ */}
        <MotiView
          from={{ opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 220 }}
          className="px-6 pb-4"
        >
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => router.push("/(admin)/class-types")}
              className="flex-1 flex-row items-center gap-2 bg-glass border border-glass-border rounded-2xl px-3.5 py-3 active:opacity-70"
            >
              <FontAwesome name="list" size={13} color="#a1a1aa" />
              <Text className="text-foreground text-sm font-body-medium flex-1" numberOfLines={1}>
                {t("admin.manage.classTypes")}
              </Text>
              <FontAwesome name="chevron-right" size={10} color="#a1a1aa" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/(admin)/rooms")}
              className="flex-1 flex-row items-center gap-2 bg-glass border border-glass-border rounded-2xl px-3.5 py-3 active:opacity-70"
            >
              <FontAwesome name="building-o" size={13} color="#a1a1aa" />
              <Text className="text-foreground text-sm font-body-medium flex-1" numberOfLines={1}>
                {t("admin.manage.rooms")}
              </Text>
              <FontAwesome name="chevron-right" size={10} color="#a1a1aa" />
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

          {/* Section header row */}
          <View className="flex-row items-center justify-between px-6 pb-3">
            <SectionLabel>{t("admin.dashboard.todaySchedule")}</SectionLabel>
            <Text
              className="text-xs font-body-semibold text-muted"
              style={{ letterSpacing: 0.3 }}
            >
              {t("admin.dashboard.classCount", { count: daySessions.length })}
            </Text>
          </View>

          {scheduleTab === "day" ? (
            <>
              {/* WeekStrip with prev/next week arrows */}
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

              <View className="px-6 pb-3">
                <Button size="small" onPress={() => setShowCreate(true)}>
                  {t("admin.schedule.newSession")}
                </Button>
              </View>

              {availabilityQuery.isError ? (
                <View className="px-6">
                  <ErrorState message={t("admin.schedule.error")} />
                </View>
              ) : null}

              {/* Day sessions list */}
              <View className="px-6">
                <SectionLabel className="pb-3">
                  {displayDate.format("dddd, D MMMM")}
                </SectionLabel>
                <View className="flex-col gap-3">
                  {daySessions.length === 0 ? (
                    <EmptyState title={t("client.dayView.noSessions")} />
                  ) : (
                    daySessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
                        className={session.classTypeName}
                        room={session.roomName ?? undefined}
                        bookedCount={session.bookedCount}
                        capacity={session.capacity}
                        status={session.availableSlots > 0 ? "available" : "full"}
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

      {/* Create Session Sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <ScrollView keyboardShouldPersistTaps="handled">
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
                className="flex-1"
                size="small"
                variant={!isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(false)}
              >
                {t("admin.schedule.once")}
              </Button>
              <Button
                className="flex-1"
                size="small"
                variant={isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(true)}
              >
                {t("admin.schedule.recurring")}
              </Button>
            </View>

            <SectionLabel>{t("admin.schedule.classType")}</SectionLabel>
            {classTypesQuery.data?.classTypes.map((ct) => (
              <Button
                key={ct.id}
                size="small"
                variant={
                  newSession.classTypeId === ct.id ? "primary" : "secondary"
                }
                onPress={() =>
                  setNewSession((s) => ({ ...s, classTypeId: ct.id }))
                }
              >
                {ct.name} ({ct.durationMins} min)
              </Button>
            ))}

            <SectionLabel>{t("admin.schedule.room")}</SectionLabel>
            {roomsQuery.data?.rooms.map((room) => (
              <Button
                key={room.id}
                size="small"
                variant={
                  newSession.roomId === room.id ? "primary" : "secondary"
                }
                onPress={() =>
                  setNewSession((s) => ({ ...s, roomId: room.id }))
                }
              >
                {t("admin.schedule.roomCap", {
                  name: room.name,
                  capacity: room.capacity,
                })}
              </Button>
            ))}

            <Input
              placeholder={t("admin.schedule.placeholderTrainer")}
              value={newSession.trainerUserId}
              onChangeText={(v) =>
                setNewSession((s) => ({ ...s, trainerUserId: v }))
              }
            />
            <DateTimePicker
              placeholder={t("admin.schedule.placeholderStart")}
              value={newSession.startsAt}
              onChange={(date) =>
                setNewSession((s) => ({ ...s, startsAt: date }))
              }
              mode="datetime"
              minimumDate={new Date()}
            />

            {isRecurring ? (
              <>
                <Input
                  placeholder={t("admin.schedule.placeholderDuration")}
                  keyboardType="numeric"
                  value={newSession.durationMins}
                  onChangeText={(v) =>
                    setNewSession((s) => ({ ...s, durationMins: v }))
                  }
                />
                <Input
                  placeholder={t("admin.schedule.placeholderRepeatCount")}
                  keyboardType="numeric"
                  value={newSession.repeatCount}
                  onChangeText={(v) =>
                    setNewSession((s) => ({ ...s, repeatCount: v }))
                  }
                />
                <Input
                  placeholder={t("admin.schedule.placeholderRepeatDays")}
                  keyboardType="numeric"
                  value={newSession.repeatEveryDays}
                  onChangeText={(v) =>
                    setNewSession((s) => ({ ...s, repeatEveryDays: v }))
                  }
                />
              </>
            ) : (
              <DateTimePicker
                placeholder={t("admin.schedule.placeholderEnd")}
                value={newSession.endsAt}
                onChange={(date) =>
                  setNewSession((s) => ({ ...s, endsAt: date }))
                }
                mode="datetime"
                minimumDate={newSession.startsAt ?? new Date()}
              />
            )}

            <Input
              placeholder={t("admin.schedule.placeholderCapacity")}
              keyboardType="numeric"
              value={newSession.capacity}
              onChangeText={(v) =>
                setNewSession((s) => ({ ...s, capacity: v }))
              }
            />

            <Button
              disabled={
                (isRecurring
                  ? createRecurringMutation.isPending
                  : createMutation.isPending) ||
                !newSession.classTypeId ||
                !newSession.startsAt ||
                (!isRecurring && !newSession.endsAt)
              }
              onPress={() => {
                if (!newSession.startsAt) return;
                if (isRecurring) {
                  createRecurringMutation.mutate({
                    classTypeId: newSession.classTypeId,
                    roomId: newSession.roomId || undefined,
                    trainerUserId: newSession.trainerUserId || undefined,
                    startsAt: newSession.startsAt.toISOString(),
                    durationMins: parseInt(newSession.durationMins, 10) || 60,
                    capacity: parseInt(newSession.capacity, 10) || 8,
                    repeatCount: parseInt(newSession.repeatCount, 10) || 4,
                    repeatEveryDays:
                      parseInt(newSession.repeatEveryDays, 10) || 7,
                  });
                } else {
                  if (!newSession.endsAt) return;
                  createMutation.mutate({
                    classTypeId: newSession.classTypeId,
                    roomId: newSession.roomId || undefined,
                    trainerUserId: newSession.trainerUserId || undefined,
                    startsAt: newSession.startsAt.toISOString(),
                    endsAt: newSession.endsAt.toISOString(),
                    capacity: parseInt(newSession.capacity, 10) || 8,
                  });
                }
              }}
            >
              {t("admin.manage.create")}
            </Button>
            {createMutation.isError || createRecurringMutation.isError ? (
              <ErrorState message={t("admin.schedule.createError")} />
            ) : null}
          </View>
        </ScrollView>
      </AppSheet>

      {/* Edit Session Sheet */}
      <AppSheet open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <ScrollView keyboardShouldPersistTaps="handled">
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
              onChange={(date) => setEditForm((s) => ({ ...s, endsAt: date }))}
              mode="datetime"
              minimumDate={editForm.startsAt ?? undefined}
            />
            <Input
              placeholder={t("admin.schedule.placeholderCapacity")}
              keyboardType="numeric"
              value={editForm.capacity}
              onChangeText={(v) => setEditForm((s) => ({ ...s, capacity: v }))}
            />
            <Input
              placeholder={t("admin.schedule.placeholderTrainer")}
              value={editForm.trainerUserId}
              onChangeText={(v) =>
                setEditForm((s) => ({ ...s, trainerUserId: v }))
              }
            />

            <SectionLabel>{t("admin.schedule.room")}</SectionLabel>
            {roomsQuery.data?.rooms.map((room) => (
              <Button
                key={room.id}
                size="small"
                variant={editForm.roomId === room.id ? "primary" : "secondary"}
                onPress={() => setEditForm((s) => ({ ...s, roomId: room.id }))}
              >
                {room.name}
              </Button>
            ))}

            <Button
              disabled={updateMutation.isPending}
              onPress={() =>
                showEdit &&
                updateMutation.mutate({
                  id: showEdit.sessionId,
                  startsAt: editForm.startsAt?.toISOString(),
                  endsAt: editForm.endsAt?.toISOString(),
                  capacity: editForm.capacity
                    ? parseInt(editForm.capacity, 10)
                    : undefined,
                  roomId: editForm.roomId || undefined,
                  trainerUserId: editForm.trainerUserId || undefined,
                })
              }
            >
              {t("admin.schedule.saveChanges")}
            </Button>
            <Button
              variant="danger"
              disabled={updateMutation.isPending}
              onPress={() =>
                showEdit &&
                updateMutation.mutate({
                  id: showEdit.sessionId,
                  status: "CANCELED",
                })
              }
            >
              {t("admin.schedule.cancelSession")}
            </Button>
            {updateMutation.isError ? (
              <ErrorState message={t("admin.schedule.updateError")} />
            ) : null}
          </View>
        </ScrollView>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
