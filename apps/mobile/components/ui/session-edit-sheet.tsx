import React, { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Switch, Text, View } from "react-native";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SectionLabel } from "@/components/ui/typography";
import { ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  sessionsQueries,
  updateSessionMutationOptions,
} from "@/lib/queries/sessions-queries-factory";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import { formatMutationError } from "@/lib/admin/format-mutation-error";

// Mutation payload shapes (kept in sync with sessionsQueries factory).
type UpdateSessionVars = {
  id: string;
  startsAt?: string;
  endsAt?: string;
  capacity?: number;
  roomId?: string | null;
  trainerUserId?: string;
  isActive?: boolean;
  status?: "SCHEDULED" | "CANCELED" | "COMPLETED";
  isAdvanced?: boolean;
};
type UpdateSeriesVars = {
  id: string;
  roomId?: string | null;
  trainerUserId?: string;
  weekdays?: number[];
  timeOfDayMins?: number;
  durationMins?: number;
  capacity?: number;
  isActive?: boolean;
  weekCount?: number;
};
type UpdateMutation = UseMutationResult<unknown, Error, UpdateSessionVars>;
type UpdateSeriesMutation = UseMutationResult<unknown, Error, UpdateSeriesVars>;
type DeleteSeriesMutation = UseMutationResult<unknown, Error, string>;

/**
 * Reusable session edit sheet — extracted from `apps/mobile/app/(admin)/pregled/index.tsx`.
 *
 * Renders an `<AppSheet>` for editing a single session OR an entire recurring
 * series, plus a confirm-cancel sheet. State, mutations and the
 * `recurringSchedule` query all live inside `useSessionEditSheet()`. Callers:
 *
 *   const editSheet = useSessionEditSheet();
 *   editSheet.openForSession(session);  // shape below
 *   <SessionEditSheet {...editSheet.bind()} />
 *
 * `session` only needs the fields used on screen — see `EditSessionInput`.
 */

export type EditSessionInput = {
  id: string;
  classTypeName: string;
  roomId: string | null;
  roomName?: string | null;
  trainerUserId: string | null;
  bookedCount: number;
  // ADR-0002: bookings across the whole recurring series (non-canceled).
  // Equal to bookedCount for singleton sessions. Defaults to bookedCount
  // when the caller doesn't have it (e.g. availability list snapshots).
  seriesBookedCount?: number;
  capacity: number;
  availableSlots?: number;
  waitlistCount?: number;
  startsAt: Date | string;
  endsAt: Date | string;
  recurringScheduleId: string | null;
  isActive?: boolean;
  /** Current per-occurrence "advanced" marking. Absent = unmarked. */
  isAdvanced?: boolean;
};

type ShowEditState = {
  sessionId: string;
  classTypeName: string;
  roomName: string | null;
  bookedCount: number;
  seriesBookedCount: number;
  capacity: number;
  availableSlots: number;
  waitlistCount: number;
  startsAt: Date;
  endsAt: Date;
  recurringScheduleId: string | null;
  isActive: boolean;
};

type EditForm = {
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: string;
  roomId: string;
  trainerUserId: string;
  status: string;
  isActive: boolean;
  isAdvanced: boolean;
};

type SeriesForm = {
  weekdays: number[];
  timeOfDayMins: string;
  durationMins: string;
  capacity: string;
  roomId: string;
  trainerUserId: string;
  weekCount: string;
  isActive: boolean;
};

export type SessionEditSheetBoundProps = {
  showEdit: ShowEditState | null;
  setShowEdit: (next: ShowEditState | null) => void;
  editScope: "session" | "series";
  setEditScope: (next: "session" | "series") => void;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  seriesForm: SeriesForm;
  setSeriesForm: React.Dispatch<React.SetStateAction<SeriesForm>>;
  confirmCancelSession: boolean;
  setConfirmCancelSession: (next: boolean) => void;
  confirmDeleteSeries: boolean;
  setConfirmDeleteSeries: (next: boolean) => void;
  futureBookingsCount: number;
  updateMutation: UpdateMutation;
  updateSeriesMutation: UpdateSeriesMutation;
  deleteSeriesMutation: DeleteSeriesMutation;
};

/**
 * Hook that owns all state, queries and mutations for the session edit sheet.
 * Spread `bind()` onto `<SessionEditSheet>`.
 */
export function useSessionEditSheet() {
  const queryClient = useQueryClient();

  const [showEdit, setShowEdit] = useState<ShowEditState | null>(null);
  const [editScope, setEditScope] = useState<"session" | "series">("session");
  const [confirmCancelSession, setConfirmCancelSession] = useState(false);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    startsAt: null,
    endsAt: null,
    capacity: "",
    roomId: "",
    trainerUserId: "",
    status: "SCHEDULED",
    isActive: true,
    isAdvanced: false,
  });
  const [seriesForm, setSeriesForm] = useState<SeriesForm>({
    weekdays: [],
    timeOfDayMins: "",
    durationMins: "",
    capacity: "",
    roomId: "",
    trainerUserId: "",
    weekCount: "",
    isActive: true,
  });

  const scheduleQuery = useQuery(
    sessionsQueries.recurringSchedule(showEdit?.recurringScheduleId ?? null),
  );
  const scheduleData = scheduleQuery.data?.schedule;
  const futureBookingsCount = scheduleQuery.data?.futureBookingsCount ?? 0;

  // Hydrate seriesForm from server when a recurring schedule loads.
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

  // Centralised invalidation: refresh availability + the byId detail
  // for the affected session, so both the dashboard and detail page update.
  const invalidate = React.useCallback(
    async (sessionId?: string) => {
      await queryClient.invalidateQueries({ queryKey: sessionsQueries.all });
      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: sessionsQueries.byId(sessionId).queryKey,
        });
      }
    },
    [queryClient],
  );

  // The single-session update splices the returned row into the `list` cache
  // (baked into the builder). We compose on top: still invalidate availability
  // + the byId DETAIL (its shape carries nested bookings/waitlist the mutation
  // doesn't return, so it must refetch), then run the close/reset side-effects.
  const updateSessionOptions = updateSessionMutationOptions(queryClient);
  const updateMutation = useMutation({
    ...updateSessionOptions,
    onSuccess: async (data, variables) => {
      updateSessionOptions.onSuccess(data);
      await invalidate(variables.id);
      setConfirmCancelSession(false);
      setShowEdit(null);
    },
  });
  const updateSeriesMutation = useMutation({
    ...sessionsQueries.updateRecurring(),
    onSuccess: async () => {
      await invalidate(showEdit?.sessionId);
      setShowEdit(null);
    },
  });
  const deleteSeriesMutation = useMutation({
    ...sessionsQueries.deleteRecurring(),
    onSuccess: async () => {
      await invalidate(showEdit?.sessionId);
      setConfirmDeleteSeries(false);
      setShowEdit(null);
    },
  });

  function openForSession(session: EditSessionInput) {
    const sessionIsActive = session.isActive ?? true;
    const startsAt =
      session.startsAt instanceof Date ? session.startsAt : new Date(session.startsAt);
    const endsAt =
      session.endsAt instanceof Date ? session.endsAt : new Date(session.endsAt);
    setEditForm({
      startsAt,
      endsAt,
      capacity: String(session.capacity),
      roomId: session.roomId ?? "",
      trainerUserId: session.trainerUserId ?? "",
      status: "SCHEDULED",
      isActive: sessionIsActive,
      isAdvanced: session.isAdvanced ?? false,
    });
    setShowEdit({
      sessionId: session.id,
      classTypeName: session.classTypeName,
      roomName: session.roomName ?? null,
      bookedCount: session.bookedCount,
      // Fall back to bookedCount when the caller didn't supply
      // seriesBookedCount — for singletons they're identical.
      seriesBookedCount: session.seriesBookedCount ?? session.bookedCount,
      capacity: session.capacity,
      availableSlots: session.availableSlots ?? 0,
      waitlistCount: session.waitlistCount ?? 0,
      startsAt,
      endsAt,
      recurringScheduleId: session.recurringScheduleId ?? null,
      isActive: sessionIsActive,
    });
    setEditScope("session");
  }

  function close() {
    setShowEdit(null);
  }

  function bind(): SessionEditSheetBoundProps {
    return {
      showEdit,
      setShowEdit,
      editScope,
      setEditScope,
      editForm,
      setEditForm,
      seriesForm,
      setSeriesForm,
      confirmCancelSession,
      setConfirmCancelSession,
      confirmDeleteSeries,
      setConfirmDeleteSeries,
      futureBookingsCount,
      updateMutation,
      updateSeriesMutation,
      deleteSeriesMutation,
    };
  }

  return {
    showEdit,
    isOpen: !!showEdit,
    openForSession,
    close,
    bind,
  };
}

export function SessionEditSheet(props: SessionEditSheetBoundProps) {
  const {
    showEdit,
    setShowEdit,
    editScope,
    setEditScope,
    editForm,
    setEditForm,
    seriesForm,
    setSeriesForm,
    confirmCancelSession,
    setConfirmCancelSession,
    confirmDeleteSeries,
    setConfirmDeleteSeries,
    futureBookingsCount,
    updateMutation,
    updateSeriesMutation,
    deleteSeriesMutation,
  } = props;
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();

  const roomsQuery = useQuery(roomsQueries.list());
  const trainersQuery = useQuery(usersQueries.trainers());

  return (
    <>
      <AppSheet
        open={!!showEdit}
        onOpenChange={() => setShowEdit(null)}
        stackBehavior="push"
      >
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

              {/* Per-occurrence "advanced" marking. Editable any time (incl.
                  after bookings exist); saves with the rest of the session. */}
              <View className="flex-row items-center justify-between px-1 py-1">
                <Text className="text-sm text-muted">
                  {t("session.advanced.switchLabel")}
                </Text>
                <Switch
                  testID="session-edit-advanced-switch"
                  value={editForm.isAdvanced}
                  onValueChange={(v) =>
                    setEditForm((s) => ({ ...s, isAdvanced: v }))
                  }
                  trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
                  style={{ transform: [{ scale: 0.85 }] }}
                />
              </View>

              {(() => {
                // ADR-0002 occurrence rule: per-session save path is disabled
                // iff THIS session has bookings, regardless of whether it
                // belongs to a recurring series.
                const sessionBookedCount = showEdit?.bookedCount ?? 0;
                const cannotHide = editForm.isActive && sessionBookedCount > 0;
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
                        {t("admin.schedule.hideBlockedSession", {
                          count: sessionBookedCount,
                        })}
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
                    // Always sent so toggling off (unmark) persists.
                    isAdvanced: editForm.isAdvanced,
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
                  message={formatMutationError(
                    updateMutation.error,
                    t,
                    lang,
                    t("admin.schedule.updateError"),
                  )}
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
                // ADR-0002 series rule: whole-series save path is disabled
                // iff ANY session in the series has bookings. We prefer the
                // session GET's seriesBookedCount (counts non-canceled
                // bookings across every session in the series, past+future);
                // fall back to the schedule endpoint's futureBookingsCount
                // when seriesBookedCount wasn't supplied by the caller.
                const seriesCount = Math.max(
                  showEdit?.seriesBookedCount ?? 0,
                  futureBookingsCount,
                );
                const cannotHide = seriesForm.isActive && seriesCount > 0;
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
                          count: seriesCount,
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
                  message={formatMutationError(
                    updateSeriesMutation.error,
                    t,
                    lang,
                    t("admin.schedule.updateError"),
                  )}
                />
              ) : null}
            </>
          )}
        </View>
      </AppSheet>
      <ConfirmSheet
        testID="series-delete-confirm-button"
        stackBehavior="push"
        open={confirmDeleteSeries}
        onOpenChange={setConfirmDeleteSeries}
        title={t("confirm.deleteSeriesTitle")}
        message={t("confirm.deleteSeriesMessage")}
        confirmLabel={t("confirm.deleteSeriesConfirm")}
        loading={deleteSeriesMutation.isPending}
        errorMessage={
          deleteSeriesMutation.isError
            ? formatMutationError(
                deleteSeriesMutation.error,
                t,
                lang,
                t("admin.schedule.updateError"),
              )
            : null
        }
        onConfirm={() => {
          if (!showEdit?.recurringScheduleId) return;
          deleteSeriesMutation.mutate(showEdit.recurringScheduleId);
        }}
      />
      <ConfirmSheet
        testID="session-cancel-confirm-button"
        stackBehavior="push"
        open={confirmCancelSession}
        onOpenChange={setConfirmCancelSession}
        title={t("confirm.cancelSessionTitle")}
        message={t("confirm.cancelSessionMessage")}
        confirmLabel={t("confirm.cancelSessionConfirm")}
        loading={updateMutation.isPending}
        errorMessage={
          updateMutation.isError && confirmCancelSession
            ? formatMutationError(
                updateMutation.error,
                t,
                lang,
                t("admin.schedule.updateError"),
              )
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
    </>
  );
}
