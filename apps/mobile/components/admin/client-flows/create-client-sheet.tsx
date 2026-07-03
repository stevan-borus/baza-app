// Create-client flow — the "Novi klijent" form sheet, extracted verbatim
// from app/(admin)/klijenti/index.tsx. The module owns its form state and
// the create mutation; the screen only holds the open flag.
//
// Behavior notes (all preserved from the screen-era code):
// - Form values persist across close/reopen and reset only after a
//   successful create — exactly the old screen-level useState lifecycle.
// - onSuccess awaits the clients-list invalidation BEFORE closing, so the
//   list behind the sheet is already refetching when the sheet dismisses.

import React, { useState } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toIsoDate } from "@/lib/date-of-birth";
import { useCreateClientMutation } from "@/lib/queries/clients-queries-factory";
import { now } from "@/lib/now";

export type CreateClientSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CreateClientForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: Date | null;
};

const EMPTY_FORM: CreateClientForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: null,
};

export function CreateClientSheet({ open, onOpenChange }: CreateClientSheetProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState<CreateClientForm>(EMPTY_FORM);

  // Cache upkeep (clients + reports counts) is baked into the factory hook;
  // the sheet-close/reset side-effects are passed per-call via
  // mutate(vars, { onSuccess }) so they can't clobber it.
  const createClientMutation = useCreateClientMutation();

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text className="text-foreground font-body-bold" style={{ fontSize: 20, letterSpacing: -0.3 }}>
          {t("admin.clients.sheetNewClient")}
        </Text>
        <Input
          testID="client-create-email-input"
          placeholder={t("admin.clients.placeholderEmail")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(v) => setForm((s) => ({ ...s, email: v }))}
        />
        <Input
          testID="client-create-firstname-input"
          placeholder={t("admin.clients.placeholderFirstName")}
          value={form.firstName}
          onChangeText={(v) => setForm((s) => ({ ...s, firstName: v }))}
        />
        <Input
          testID="client-create-lastname-input"
          placeholder={t("admin.clients.placeholderLastName")}
          value={form.lastName}
          onChangeText={(v) => setForm((s) => ({ ...s, lastName: v }))}
        />
        <Input
          testID="client-create-phone-input"
          placeholder={t("admin.clients.placeholderPhone")}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
        {/* DOB is required server-side (inviteClientInputSchema) for the
            minor/guardian waiver logic — collect it here like the invite form. */}
        <DateTimePicker
          testID="client-create-dob-input"
          mode="date"
          value={form.dateOfBirth}
          onChange={(d) => setForm((s) => ({ ...s, dateOfBirth: d }))}
          placeholder={t("admin.clients.placeholderDateOfBirth")}
          maximumDate={now()}
          minimumDate={new Date(Date.UTC(1900, 0, 1))}
        />
        <Button
          testID="client-create-submit-button"
          disabled={
            createClientMutation.isPending ||
            !form.email ||
            !form.firstName ||
            !form.lastName ||
            !form.dateOfBirth
          }
          onPress={() => {
            if (!form.dateOfBirth) return;
            createClientMutation.mutate(
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
                },
              },
            );
          }}
        >
          {t("admin.clients.createClient")}
        </Button>
        {createClientMutation.isError ? <ErrorState message={t("admin.clients.createError")} /> : null}
      </View>
    </AppSheet>
  );
}
