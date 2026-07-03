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
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SheetHeader } from "@/components/admin/client-flows/sheet-header";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

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

const EMPTY_FORM = { startsAt: "", endsAt: "", reason: "" };

export function PauseSheet({ clientProfileId, onClose, onBack }: PauseSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY_FORM);

  const pauseMutation = useMutation({
    ...packagesQueries.pause(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: packagesQueries.all });
      onClose();
      setForm(EMPTY_FORM);
    },
  });

  return (
    <AppSheet
      open={!!clientProfileId}
      onOpenChange={() => onClose()}
      stackBehavior="push"
    >
      <View className="flex-col gap-4">
        <SheetHeader title={t("admin.clients.sheetPause")} onBack={onBack} />
        <Input
          testID="pause-start-input"
          placeholder={t("admin.clients.pauseStart")}
          value={form.startsAt}
          onChangeText={(v) => setForm((s) => ({ ...s, startsAt: v }))}
        />
        <Input
          testID="pause-end-input"
          placeholder={t("admin.clients.pauseEnd")}
          value={form.endsAt}
          onChangeText={(v) => setForm((s) => ({ ...s, endsAt: v }))}
        />
        <Input
          placeholder={t("admin.clients.pauseReason")}
          value={form.reason}
          onChangeText={(v) => setForm((s) => ({ ...s, reason: v }))}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <Button
          testID="pause-submit-button"
          disabled={pauseMutation.isPending || !form.startsAt || !form.endsAt}
          onPress={() =>
            clientProfileId &&
            pauseMutation.mutate({
              clientProfileId,
              startsAt: form.startsAt,
              endsAt: form.endsAt,
              reason: form.reason || undefined,
            })
          }
        >
          {t("admin.clients.pauseSubmit")}
        </Button>
        {pauseMutation.isError ? <ErrorState message={t("admin.clients.pauseError")} /> : null}
      </View>
    </AppSheet>
  );
}
