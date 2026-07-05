// Invite flow — the "Pozovi klijenta" form sheet, extracted verbatim from
// app/(admin)/klijenti/index.tsx. The module owns its form state and the
// create-invite mutation; the screen only holds the open flag.
//
// Behavior notes (all preserved from the screen-era code):
// - Form values persist across close/reopen and reset only after a
//   successful send — exactly the lifecycle the old screen-level useState had.
// - The invites-list cache splice lives in createInviteMutationOptions
//   (options-builder convention); the per-call onSuccess here only closes
//   the sheet and resets the form.

import React, { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toIsoDate } from "@/lib/date-of-birth";
import { createInviteMutationOptions } from "@/lib/queries/invites-queries-factory";
import { now } from "@/lib/now";

export type InviteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful invite — lets the screen switch to the
   *  invites tab so the admin sees the just-added client land there. */
  onInvited?: () => void;
};

type InviteForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: Date | null;
};

const EMPTY_FORM: InviteForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: null,
};

export function InviteSheet({ open, onOpenChange, onInvited }: InviteSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);

  const createInviteMutation = useMutation(
    createInviteMutationOptions(queryClient),
  );

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text className="text-foreground font-body-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
          {t("admin.clients.sheetInvite")}
        </Text>
        <Input
          testID="invite-create-email-input"
          placeholder={t("admin.clients.placeholderEmail")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(v) => setForm((s) => ({ ...s, email: v }))}
        />
        <Input
          testID="invite-create-name-input"
          placeholder={t("admin.clients.placeholderFirstName")}
          value={form.firstName}
          onChangeText={(v) => setForm((s) => ({ ...s, firstName: v }))}
        />
        <Input
          testID="invite-create-lastname-input"
          placeholder={t("admin.clients.placeholderLastName")}
          value={form.lastName}
          onChangeText={(v) => setForm((s) => ({ ...s, lastName: v }))}
        />
        <Input
          testID="invite-create-phone-input"
          placeholder={t("admin.clients.placeholderPhone")}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
        <DateTimePicker
          testID="invite-create-dob-input"
          mode="date"
          value={form.dateOfBirth}
          onChange={(d) => setForm((s) => ({ ...s, dateOfBirth: d }))}
          placeholder={t("admin.clients.placeholderDateOfBirth")}
          maximumDate={now()}
          minimumDate={new Date(Date.UTC(1900, 0, 1))}
        />
        <Button
          testID="invite-create-submit-button"
          disabled={
            createInviteMutation.isPending ||
            !form.email ||
            !form.firstName ||
            !form.lastName ||
            !form.dateOfBirth
          }
          onPress={() => {
            if (!form.dateOfBirth) return;
            createInviteMutation.mutate(
              {
                email: form.email,
                firstName: form.firstName,
                lastName: form.lastName,
                phone: form.phone || undefined,
                dateOfBirth: toIsoDate(form.dateOfBirth),
              },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  setForm(EMPTY_FORM);
                  onInvited?.();
                },
              },
            );
          }}
        >
          {t("admin.clients.sendInvite")}
        </Button>
        {createInviteMutation.isError ? <ErrorState message={t("admin.clients.inviteError")} /> : null}
      </View>
    </AppSheet>
  );
}
