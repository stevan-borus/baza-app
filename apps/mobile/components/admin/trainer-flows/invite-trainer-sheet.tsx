// The trainer counterpart of `client-flows/invite-sheet.tsx`. It is a separate
// component rather than a role toggle on the client sheet because the two forms
// genuinely differ: a trainer invite collects no date of birth (DOB exists only
// to seed clientProfile at redemption, and a trainer never gets one), and
// keeping it out of client-flows leaves the Klijenti surface honestly
// client-scoped.
//
// Form lifecycle mirrors the client sheet: values persist across close/reopen
// and reset only after a successful send. The invites-list cache splice lives
// in createInviteMutationOptions (options-builder convention); the per-call
// onSuccess here only closes the sheet and resets the form.
//
// The commission percent is optional on the API but REQUIRED here: an invite
// without one produces a trainer payroll reads as 0% until someone remembers
// to set a rate, and the moment the studio agrees the split is while they are
// filling this form — not weeks later at the first payout.

import React, { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { createInviteMutationOptions } from "@/lib/queries/invites-queries-factory";

export type InviteTrainerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type InviteTrainerForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  percent: string;
};

const EMPTY_FORM: InviteTrainerForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  percent: "",
};

export function InviteTrainerSheet({ open, onOpenChange }: InviteTrainerSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<InviteTrainerForm>(EMPTY_FORM);

  const createInviteMutation = useMutation(
    createInviteMutationOptions(queryClient),
  );

  // Same whole-percent 0–100 range the rates editor enforces — this becomes
  // exactly that kind of row at redemption.
  const parsedPercent = Number(form.percent);
  const percentValid =
    form.percent.trim() !== "" &&
    Number.isInteger(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 100;

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text className="text-foreground font-body-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
          {t("admin.trainers.sheetInvite")}
        </Text>
        <Input
          testID="invite-trainer-email-input"
          placeholder={t("admin.clients.placeholderEmail")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(v) => setForm((s) => ({ ...s, email: v }))}
        />
        <Input
          testID="invite-trainer-name-input"
          placeholder={t("admin.clients.placeholderFirstName")}
          value={form.firstName}
          onChangeText={(v) => setForm((s) => ({ ...s, firstName: v }))}
        />
        <Input
          testID="invite-trainer-lastname-input"
          placeholder={t("admin.clients.placeholderLastName")}
          value={form.lastName}
          onChangeText={(v) => setForm((s) => ({ ...s, lastName: v }))}
        />
        <Input
          testID="invite-trainer-phone-input"
          placeholder={t("admin.clients.placeholderPhone")}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
        <Input
          testID="invite-trainer-percent-input"
          placeholder={t("admin.trainers.percentPlaceholder")}
          keyboardType="number-pad"
          value={form.percent}
          onChangeText={(v) => setForm((s) => ({ ...s, percent: v }))}
        />
        <Button
          testID="invite-trainer-submit-button"
          disabled={
            createInviteMutation.isPending ||
            !form.email ||
            !form.firstName ||
            !form.lastName ||
            !percentValid
          }
          onPress={() => {
            createInviteMutation.mutate(
              {
                email: form.email,
                firstName: form.firstName,
                lastName: form.lastName,
                phone: form.phone || undefined,
                role: "TRAINER",
                trainerPercent: parsedPercent,
              },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  setForm(EMPTY_FORM);
                },
              },
            );
          }}
        >
          {t("admin.trainers.sendInvite")}
        </Button>
        {createInviteMutation.isError ? <ErrorState message={t("admin.trainers.inviteError")} /> : null}
      </View>
    </AppSheet>
  );
}
