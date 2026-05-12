/**
 * NewSessionSheet — extracted from pregled/index.tsx so it can be opened
 * from any admin screen (Pregled today via the header `+`, Katalog tomorrow
 * via the "Novi termin" hero row).
 *
 * Self-contained: owns all form state, both mutations (single + recurring),
 * and the reset logic. Caller only controls open/close.
 */
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatMutationError } from "@/lib/admin/format-mutation-error";
import { Pressable, Switch, Text, View } from "react-native";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import { applySessionFormChange } from "@/lib/admin/session-form-state";

export type NewSessionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SessionFormState = {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: string;
  durationMins: string;
  weekCount: string;
  weekdays: number[];
};

const INITIAL_FORM: SessionFormState = {
  classTypeId: "",
  roomId: "",
  trainerUserId: "",
  startsAt: null,
  endsAt: null,
  capacity: "",
  durationMins: "",
  weekCount: "",
  weekdays: [],
};

export function NewSessionSheet({ open, onOpenChange }: NewSessionSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();

  const [isRecurring, setIsRecurring] = useState(false);
  const [createIsActive, setCreateIsActive] = useState(true);
  const [newSession, setNewSession] = useState<SessionFormState>(INITIAL_FORM);

  const classTypesQuery = useQuery(trainingsQueries.classTypes());
  const roomsQuery = useQuery(roomsQueries.list());
  const trainersQuery = useQuery(usersQueries.trainers());

  function resetCreateForm() {
    setNewSession(INITIAL_FORM);
    setIsRecurring(false);
    setCreateIsActive(true);
  }

  const createMutation = useMutation({
    ...sessionsQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onOpenChange(false);
      resetCreateForm();
    },
  });
  const createRecurringMutation = useMutation({
    ...sessionsQueries.createRecurring(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onOpenChange(false);
      resetCreateForm();
    },
  });

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
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
            message={formatMutationError(
              createMutation.error ?? createRecurringMutation.error,
              t,
              lang,
              t("admin.schedule.createError"),
            )}
          />
        ) : null}
      </View>
    </AppSheet>
  );
}
