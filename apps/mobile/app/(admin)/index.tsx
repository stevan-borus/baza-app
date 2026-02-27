import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, type ICalendarEventBase } from "react-native-big-calendar";
import { Text, XStack, YStack } from "tamagui";
import { useCalendarTheme } from "@/lib/calendar-theme";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, ListRow } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { HEADER_HEIGHT } from "@/components/ui/constants";
import { SegmentedControl } from "@/components/ui/tabs";
import { getDateLocale } from "@/lib/i18n";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";

type ViewMode = "day" | "week" | "month";

interface SessionEvent extends ICalendarEventBase {
  sessionId: string;
  classTypeName: string;
  roomName: string | null;
  bookedCount: number;
  capacity: number;
  availableSlots: number;
  waitlistCount: number;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdminSchedule() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<SessionEvent | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const locale = getDateLocale().startsWith("en") ? "en" : "sr";
  const cal = useCalendarTheme();

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );
  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const roomsQuery = useQuery(roomsQueries.list());

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

  const events: SessionEvent[] = (availabilityQuery.data?.sessions ?? []).map(
    (s) => ({
      sessionId: s.id,
      title: `${s.classTypeName} (${s.bookedCount}/${s.capacity})`,
      start: new Date(s.startsAt),
      end: new Date(s.endsAt),
      classTypeName: s.classTypeName,
      roomName: s.roomName,
      bookedCount: s.bookedCount,
      capacity: s.capacity,
      availableSlots: s.availableSlots,
      waitlistCount: s.waitlistCount,
    }),
  );

  function handleEventPress(event: SessionEvent) {
    setEditForm({
      startsAt: event.start,
      endsAt: event.end,
      capacity: String(event.capacity),
      roomId: "",
      trainerUserId: "",
      status: "SCHEDULED",
    });
    setShowEdit(event);
  }

  function handleDateChange(date: Date) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key !== month) setMonth(key);
    setCalendarDate(date);
  }

  return (
    <YStack
      flex={1}
      style={{ paddingTop: insets.top + HEADER_HEIGHT + 12 }}
    >
      <YStack px="$5" gap="$3">
        <Card>
          <YStack gap="$3">
            <SegmentedControl
              segments={[
                { value: "day" as const, label: t("admin.schedule.viewDay") },
                { value: "week" as const, label: t("admin.schedule.viewWeek") },
                {
                  value: "month" as const,
                  label: t("admin.schedule.viewMonth"),
                },
              ]}
              value={viewMode}
              onValueChange={setViewMode}
            />
            <Button size="small" onPress={() => setShowCreate(true)}>
              {t("admin.schedule.newSession")}
            </Button>
          </YStack>
        </Card>
      </YStack>

      {availabilityQuery.isError ? (
        <YStack px="$5">
          <ErrorState message={t("admin.schedule.error")} />
        </YStack>
      ) : null}

      <YStack flex={1} minHeight={500} px="$5">
        <Card>
          <Calendar
            events={events}
            height={480}
            mode={
              viewMode === "day"
                ? "day"
                : viewMode === "week"
                  ? "week"
                  : "month"
            }
            theme={cal.calendarTheme}
            calendarContainerStyle={cal.calendarContainerStyle}
            bodyContainerStyle={cal.bodyContainerStyle}
            headerContainerStyle={cal.headerContainerStyle}
            eventCellStyle={cal.eventCellStyle}
            eventCellTextColor={cal.eventCellTextColor}
            calendarCellStyle={cal.calendarCellStyle}
            calendarCellTextStyle={cal.calendarCellTextStyle}
            date={calendarDate}
            onPressEvent={(event) => handleEventPress(event as SessionEvent)}
            onSwipeEnd={handleDateChange}
            swipeEnabled
            weekStartsOn={1}
            locale={locale}
          />
        </Card>
      </YStack>

      {/* Create Session Sheet */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <YStack gap="$5" pb="$5">
            <Text
              fontSize="$6"
              fontWeight="700"
              color="$color"
              letterSpacing={-0.3}
            >
              {isRecurring
                ? t("admin.schedule.sheetRecurring")
                : t("admin.schedule.sheetNew")}
            </Text>
            <XStack gap="$2">
              <Button
                flex={1}
                size="small"
                variant={!isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(false)}
              >
                {t("admin.schedule.once")}
              </Button>
              <Button
                flex={1}
                size="small"
                variant={isRecurring ? "primary" : "secondary"}
                onPress={() => setIsRecurring(true)}
              >
                {t("admin.schedule.recurring")}
              </Button>
            </XStack>

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
          </YStack>
        </ScrollView>
      </AppSheet>

      {/* Edit Session Sheet */}
      <AppSheet open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <YStack gap="$5" pb="$5">
            <Text
              fontSize="$6"
              fontWeight="700"
              color="$color"
              letterSpacing={-0.3}
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
          </YStack>
        </ScrollView>
      </AppSheet>
    </YStack>
  );
}

