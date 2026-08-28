// Pause-package flow — the "Pauziraj paket" form sheet, extracted verbatim
// from app/(admin)/klijenti/index.tsx and now ALSO consumed by the
// client-detail screen. The module owns its form state and the pause
// mutation; each screen holds one `pauseClientId` per the flow.
//
// The flow needs nothing from the client row beyond the ClientProfile id,
// so the interface is just the id — no entity prop, no fetch.
//
// Behavior notes (preserved from the screen-era code):
// - Form values persist across close/reopen and reset only after a
//   successful pause — the old screen-level useState lifecycle.
// - onSuccess awaits the packages invalidation BEFORE closing and resetting.

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
import { usePausePackageMutation } from "@/lib/queries/packages-queries-factory";

export type PauseSheetProps = {
  /**
   * ClientProfile id of the pause target; the sheet is open exactly while
   * this is non-null.
   */
  clientProfileId: string | null;
  onClose: () => void;
  /**
   * Back chevron — the SCREEN decides where "back" goes (actions sheet).
   * Omit it (client-detail) for a chevron-less header.
   */
  onBack?: () => void;
};

type PauseForm = {
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string;
};

const EMPTY_FORM: PauseForm = { startsAt: null, endsAt: null, reason: "" };

export function PauseSheet({ clientProfileId, onClose, onBack }: PauseSheetProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState<PauseForm>(EMPTY_FORM);

  // Cache upkeep (packages + clients packageStatus) is baked into the
  // factory hook; close/reset ride per-call so they can't clobber it.
  const pauseMutation = usePausePackageMutation();

  const today = startOfLocalDay(now());

  return (
    <AppSheet
      open={!!clientProfileId}
      onOpenChange={() => onClose()}
      stackBehavior="push"
    >
      <View className="flex-col gap-4">
        <SheetHeader title={t("admin.clients.sheetPause")} onBack={onBack} />
        <DateTimePicker
          testID="pause-start-input"
          mode="date"
          value={form.startsAt}
          onChange={(d) =>
            setForm((s) => ({
              ...s,
              startsAt: d,
              // A start moved to or past the chosen end leaves a range the
              // server rejects, so drop the now-stale end.
              endsAt: s.endsAt && s.endsAt <= d ? null : s.endsAt,
            }))
          }
          placeholder={t("admin.clients.pauseStart")}
          minimumDate={today}
        />
        <DateTimePicker
          testID="pause-end-input"
          mode="date"
          value={form.endsAt}
          onChange={(d) => setForm((s) => ({ ...s, endsAt: d }))}
          placeholder={t("admin.clients.pauseEnd")}
          minimumDate={form.startsAt ?? today}
        />
        <Input
          placeholder={t("admin.clients.pauseReason")}
          value={form.reason}
          onChangeText={(v) => setForm((s) => ({ ...s, reason: v }))}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <Text
          testID="pause-consequences-hint"
          className="text-muted"
          style={{ fontSize: 12 }}
        >
          {t("admin.clients.pauseHint")}
        </Text>
        <Button
          testID="pause-submit-button"
          disabled={pauseMutation.isPending || !form.startsAt || !form.endsAt}
          onPress={() => {
            const { startsAt, endsAt } = form;
            if (!clientProfileId || !startsAt || !endsAt) return;
            pauseMutation.mutate(
              {
                clientProfileId,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                reason: form.reason || undefined,
              },
              {
                onSuccess: () => {
                  onClose();
                  setForm(EMPTY_FORM);
                },
              },
            );
          }}
        >
          {t("admin.clients.pauseSubmit")}
        </Button>
        {pauseMutation.isError ? (
          <ErrorState
            message={
              // A 409 is the one failure the admin can act on: the window
              // collides with a pause this client already has. Everything else
              // stays on the generic copy — see lib/admin/format-mutation-error
              // for why a server message is never shown raw.
              pauseMutation.error instanceof ApiError &&
              pauseMutation.error.status === 409
                ? t("admin.clients.pauseOverlapError")
                : t("admin.clients.pauseError")
            }
          />
        ) : null}
      </View>
    </AppSheet>
  );
}
