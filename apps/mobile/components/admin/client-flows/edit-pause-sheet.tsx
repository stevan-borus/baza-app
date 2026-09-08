// Edit-pause flow — the "Izmeni pauzu" form sheet, opened from the PauseCard
// on client detail. Structured like the create sheet (pause-sheet.tsx): two
// date pickers, an optional reason, the consequences hint, one submit.
//
// Both ends stay editable however far along the pause is, including one that
// is already running: a client who turns up for the first two days after all
// gets the start moved forward, not the pause ended and a new one created.
// The server refunds the old grant and re-grants the new window, so the sheet
// only has to send the dates the admin picked.
//
// The two ends have different floors. The START may move BACKWARD into the
// past — "I was actually away from the 1st, not the 2nd" is a correction, and
// the admin should fix the date rather than end the pause and recreate it. The
// END may not: an endsAt that is not in the future is a 400 from the server,
// because cutting a pause short is the end-pause endpoint's job.
//
// The form seeds from props without an effect: the inner component is keyed
// by pause id, so a different pause remounts it and the useState initializers
// run again against the new values.

import React, { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SheetHeader } from "@/components/admin/client-flows/sheet-header";
import { ApiError } from "@/lib/api-error";
import { startOfLocalDay } from "@/lib/dates";
import { now } from "@/lib/now";
import { useUpdatePackagePauseMutation } from "@/lib/queries/packages-queries-factory";

export type EditablePause = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type EditPauseSheetProps = {
  /** The pause being edited; the sheet is open exactly while this is non-null. */
  pause: EditablePause | null;
  onClose: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function EditPauseSheet({ pause, onClose }: EditPauseSheetProps) {
  return (
    <AppSheet
      open={!!pause}
      onOpenChange={() => onClose()}
      stackBehavior="push"
    >
      {pause ? (
        <EditPauseForm key={pause.id} pause={pause} onClose={onClose} />
      ) : null}
    </AppSheet>
  );
}

function EditPauseForm({
  pause,
  onClose,
}: {
  pause: EditablePause;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [startsAt, setStartsAt] = useState<Date | null>(
    startOfLocalDay(new Date(pause.startsAt)),
  );
  const [endsAt, setEndsAt] = useState<Date | null>(
    startOfLocalDay(new Date(pause.endsAt)),
  );
  const [reason, setReason] = useState(pause.reason ?? "");

  const updateMutation = useUpdatePackagePauseMutation();

  const today = startOfLocalDay(now());
  const tomorrow = new Date(today.getTime() + DAY_MS);
  // Correcting a start is a day or two out, so a month of slack covers every
  // real case. An unbounded past would let one mis-tap drag the pause back
  // months, and since every paused day grants a day of package validity, that
  // silently inflates expiry.
  const startMinimum = new Date(
    startOfLocalDay(new Date(pause.startsAt)).getTime() - 30 * DAY_MS,
  );
  // The end stays future-bound even when the start does not: the server
  // refuses an endsAt that is not in the future, so a floor of "tomorrow"
  // matches it. The window must also be at least one day wide, so the end can
  // never sit on the start — hence "the later of tomorrow and the day after
  // the chosen start", which stays right for a start already in the past.
  const endMinimum = startsAt
    ? new Date(Math.max(tomorrow.getTime(), startsAt.getTime() + DAY_MS))
    : tomorrow;

  return (
    <View className="flex-col gap-4">
      <SheetHeader title={t("admin.clientDetail.editPauseTitle")} />
      <DateTimePicker
        testID="edit-pause-start-input"
        mode="date"
        value={startsAt}
        onChange={(d) => {
          setStartsAt(d);
          // A start moved to or past the chosen end leaves a range the server
          // rejects, so drop the now-stale end.
          setEndsAt((prev) => (prev && prev <= d ? null : prev));
        }}
        placeholder={t("admin.clients.pauseStart")}
        minimumDate={startMinimum}
      />
      <DateTimePicker
        testID="edit-pause-end-input"
        mode="date"
        value={endsAt}
        onChange={(d) => setEndsAt(d)}
        placeholder={t("admin.clients.pauseEnd")}
        minimumDate={endMinimum}
      />
      <Input
        testID="edit-pause-reason-input"
        placeholder={t("admin.clients.pauseReason")}
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: "top" }}
      />
      <Text
        testID="edit-pause-consequences-hint"
        className="text-muted"
        style={{ fontSize: 12 }}
      >
        {t("admin.clientDetail.editPauseHint")}
      </Text>
      <Button
        testID="edit-pause-submit-button"
        disabled={updateMutation.isPending || !startsAt || !endsAt}
        onPress={() => {
          if (!startsAt || !endsAt) return;
          updateMutation.mutate(
            {
              id: pause.id,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              // An emptied field means "no reason", not "leave it" — send
              // null so the server clears the stored one.
              reason: reason.trim() === "" ? null : reason,
            },
            { onSuccess: () => onClose() },
          );
        }}
      >
        {t("admin.clientDetail.editPauseSubmit")}
      </Button>
      {updateMutation.isError ? (
        <ErrorState
          message={
            // A 409 is the one failure the admin can act on: the new window
            // collides with another pause this client has. Everything else
            // stays generic — see lib/admin/format-mutation-error for why a
            // server message is never shown raw.
            updateMutation.error instanceof ApiError &&
            updateMutation.error.status === 409
              ? t("admin.clients.pauseOverlapError")
              : t("admin.clientDetail.editPauseError")
          }
        />
      ) : null}
    </View>
  );
}
