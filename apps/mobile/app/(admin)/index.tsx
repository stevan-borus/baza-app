import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import dayjs from "dayjs";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { SessionCard } from "@/components/ui/session-card";
import { WeekStrip } from "@/components/ui/week-strip";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { HEADER_HEIGHT } from "@/components/ui/constants";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function AdminSchedule() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
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
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
  }

  function navigateMonth(direction: -1 | 1) {
    const newDate = displayDate.add(direction, "month").startOf("month");
    setSelectedDate(newDate.format("YYYY-MM-DD"));
    setMonth(monthKeyFromDate(newDate));
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

  return (
    <View
      className="flex-1 flex-col"
      style={{ paddingTop: insets.top + HEADER_HEIGHT + 12 }}
    >
      {/* Gear icon for settings */}
      <View className="flex-row justify-end px-5 pt-2">
        <TouchableOpacity onPress={() => router.push("/(admin)/settings")} activeOpacity={0.6}>
          <FontAwesome name="cog" size={22} color="#a1a1aa" />
        </TouchableOpacity>
      </View>

      {/* Quick stats row */}
      <View className="flex-row px-5 gap-3 pb-3">
        <View className="flex-1">
          <StatCard
            label={t("admin.dashboard.todaySessions")}
            value={daySessions.length}
            icon="calendar"
          />
        </View>
        <View className="flex-1">
          <StatCard
            label={t("admin.dashboard.activeClients")}
            value={summary?.activeClients ?? "—"}
            icon="users"
          />
        </View>
        <View className="flex-1">
          <StatCard
            label={t("admin.dashboard.revenue")}
            value={summary?.revenue ?? "—"}
            icon="money"
          />
        </View>
      </View>

      {/* Month/year header with arrows */}
      <View className="flex-row px-5 py-3 justify-between items-center">
        <FontAwesome
          name="chevron-left"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(-1)}
        />
        <Text
          className="text-foreground font-bold"
          style={{ fontSize: 18, letterSpacing: -0.3 }}
        >
          {displayDate.format("MMMM YYYY")}
        </Text>
        <FontAwesome
          name="chevron-right"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(1)}
        />
      </View>

      {/* WeekStrip */}
      <View className="px-5 pb-3">
        <WeekStrip
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          activityByDate={activityByDate}
        />
      </View>

      <View className="px-5 pb-3">
        <Button size="small" onPress={() => setShowCreate(true)}>
          {t("admin.schedule.newSession")}
        </Button>
      </View>

      {availabilityQuery.isError ? (
        <View className="px-5">
          <ErrorState message={t("admin.schedule.error")} />
        </View>
      ) : null}

      {/* Day sessions list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        <SectionLabel>
          {displayDate.format("dddd, D MMMM")}
        </SectionLabel>
        <View className="flex-col gap-3 pt-3">
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
      </ScrollView>

      {/* Create Session Sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View className="flex-col gap-5 pb-5">
            <Text
              className="text-foreground font-bold"
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
              className="text-foreground font-bold"
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
    </View>
  );
}
