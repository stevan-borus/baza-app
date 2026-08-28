// End-pause flow — the "Prekini pauzu" action plus its confirmation, offered
// on the client-detail header while a pause is running.
//
// Why the confirm step: ending a pause is not an undo. The server refunds the
// unused tail of the window, so every package's expiresAt moves BACK — the
// date the admin read a second ago is no longer the date. And the bookings the
// pause cancelled stay cancelled; those seats went back into circulation and
// may already belong to a promoted waitlist client. Both are invisible from
// the button, so the copy says them out loud before anything is written.
//
// The action renders nothing without an `activePause`: the pause id is the
// only thing the endpoint takes, and a payload cached before the field existed
// carries the "paused" status without it. Offering a button that cannot fire
// is worse than not offering one.

import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { ApiError } from "@/lib/api-error";
import { useEndPackagePauseMutation } from "@/lib/queries/packages-queries-factory";

export type ActivePause = {
  id: string;
  startsAt: string;
  endsAt: string;
};

export function EndPauseAction({ pause }: { pause: ActivePause }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  // Cache upkeep (packages + clients packageStatus + reports + the client's
  // own "Moji paketi" timeline) is baked into the factory hook.
  const endPauseMutation = useEndPackagePauseMutation();

  return (
    <>
      <Pressable
        testID="client-end-pause-button"
        onPress={() => setConfirming(true)}
        hitSlop={8}
        android_ripple={null}
        className="active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={t("admin.clientDetail.endPauseAction")}
      >
        <Text
          className="text-accent font-body-semibold"
          style={{ fontSize: 13 }}
        >
          {t("admin.clientDetail.endPauseAction")}
        </Text>
      </Pressable>

      <ConfirmSheet
        testID="client-end-pause-confirm-button"
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
        title={t("admin.clientDetail.endPauseTitle")}
        message={t("admin.clientDetail.endPauseMessage")}
        confirmLabel={t("admin.clientDetail.endPauseConfirm")}
        loading={endPauseMutation.isPending}
        errorMessage={
          endPauseMutation.isError
            ? // A 409 is the one failure the admin can read something into:
              // the window closed under them (the pause ran out, or another
              // tab already ended it). Everything else stays generic — see
              // lib/admin/format-mutation-error for why a server message is
              // never shown raw.
              endPauseMutation.error instanceof ApiError &&
              endPauseMutation.error.status === 409
              ? t("admin.clientDetail.endPauseFinishedError")
              : t("admin.clientDetail.endPauseError")
            : null
        }
        onConfirm={() =>
          // Close only on success — a failed end keeps the sheet up with the
          // error, instead of dismissing silently (which reads as "done").
          endPauseMutation.mutate(pause.id, {
            onSuccess: () => setConfirming(false),
          })
        }
      />
    </>
  );
}
