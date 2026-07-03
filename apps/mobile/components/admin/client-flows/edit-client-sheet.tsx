// Edit-client flow — the "Izmeni klijenta" form sheet, extracted from
// app/(admin)/klijenti/index.tsx and now ALSO consumed by the client-detail
// screen. The module owns its form state and the update mutation; each
// screen holds one `EditClientSheetClient | null` snapshot per the flow.
//
// Entity-as-prop choice: the sheet takes the client ROW as a prop (a narrow
// structural type, so any richer row — klijenti list item, client-detail's
// byId shape — is assignable) instead of fetching by id. Both screens
// already hold the data, and both old implementations initialized the form
// from it at "Izmeni" press time, so a prop keeps the data source identical
// without a second request.
//
// Two consumers, one form — the differences are carried by the ENTITY:
// - `dateOfBirth` key present (client-detail's byId shape) → the DOB picker
//   renders and the PATCH payload includes `dateOfBirth`. Key absent
//   (klijenti list rows — the Zod response schema strips unknown keys) →
//   neither renders nor sends it, byte-identical to the pre-dedupe list flow.
// - `user.isActive` present → seeds the Aktivan switch; absent → seeds
//   `true` (the klijenti flow hardcoded it because the list row doesn't
//   carry isActive — preserved verbatim via the `?? true` fallback).
// - `id` is whatever path segment the consumer's flow already sent to
//   PATCH /api/clients/:id (klijenti passes the ClientProfile id, detail
//   passes the User id — preserved as-is, the module doesn't reinterpret).
// - `onBack` optional: klijenti shows the back-to-actions chevron, detail
//   has no previous sheet step and renders the bare title.
//
// Behavior notes (preserved from the screen-era code):
// - The form re-initializes from `client` on every closed→open transition
//   (the old actions-sheet handler rebuilt the form on every press), via the
//   render-time state-adjust pattern — no effect.
// - Form values stay rendered during the close animation (the sheet body is
//   always mounted), exactly like the old screen-level form state. The DOB
//   block's visibility is state captured at open time (not derived from the
//   possibly-null `client`) for the same reason.

import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SheetHeader } from "@/components/admin/client-flows/sheet-header";
import { useUpdateClientMutation } from "@/lib/queries/clients-queries-factory";
import { parseDateOfBirth, toIsoDate } from "@/lib/date-of-birth";
import { now } from "@/lib/now";

export type EditClientSheetClient = {
  /** The PATCH /api/clients/:id path segment (see module doc — consumer-defined). */
  id: string;
  user: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    /** Seeds the Aktivan switch when present; absent seeds `true`. */
    isActive?: boolean;
  };
  notes?: string | null;
  /**
   * yyyy-mm-dd or null. KEY PRESENCE (not value) is the signal: entities
   * carrying the key get the DOB picker and a `dateOfBirth` field in the
   * PATCH payload; entities without it get neither.
   */
  dateOfBirth?: string | null;
};

export type EditClientSheetProps = {
  /** The flow's open state: the sheet is open exactly while this is non-null. */
  client: EditClientSheetClient | null;
  onClose: () => void;
  /**
   * Back chevron in the header. The SCREEN decides what "back" means
   * (klijenti reopens the actions sheet) — cross-flow choreography stays
   * out of this module. Omit it (client-detail) for a chevron-less header.
   */
  onBack?: () => void;
};

type EditClientForm = {
  firstName: string;
  lastName: string;
  phone: string;
  notes: string;
  isActive: boolean;
  dateOfBirth: Date | null;
};

export function EditClientSheet({ client, onClose, onBack }: EditClientSheetProps) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  const open = client !== null;

  const [form, setForm] = useState<EditClientForm>({
    firstName: "",
    lastName: "",
    phone: "",
    notes: "",
    isActive: true,
    dateOfBirth: null,
  });
  // Whether this entity carries date-of-birth at all — captured at open time
  // so the DOB block doesn't vanish mid-close-animation when `client` goes
  // null (the body stays mounted, like the form values).
  const [showDateOfBirth, setShowDateOfBirth] = useState(false);
  // Re-initialize the form on every closed→open transition (render-time
  // state adjust — see the React "adjusting state when a prop changes"
  // pattern). Keyed on the open flag, not client.id, so reopening the SAME
  // client also discards abandoned edits, as the old flow did.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (client) {
      setShowDateOfBirth("dateOfBirth" in client);
      setForm({
        firstName: client.user.firstName,
        lastName: client.user.lastName,
        phone: client.user.phone ?? "",
        notes: client.notes ?? "",
        isActive: client.user.isActive ?? true,
        dateOfBirth:
          "dateOfBirth" in client
            ? parseDateOfBirth(client.dateOfBirth ?? "")
            : null,
      });
    }
  }

  // Cache upkeep (clients list + byId + reports counts) is baked into the
  // factory hook; onClose rides per-call so it can't clobber it.
  const updateClientMutation = useUpdateClientMutation();

  return (
    <AppSheet
      open={open}
      onOpenChange={() => onClose()}
      stackBehavior="push"
    >
      <View className="flex-col gap-4">
        <SheetHeader title={t("admin.clients.sheetEdit")} onBack={onBack} />
        <SectionLabel>{t("admin.clients.placeholderFirstName")}</SectionLabel>
        <Input
          placeholder={t("admin.clients.placeholderFirstName")}
          value={form.firstName}
          onChangeText={(v) => setForm((s) => ({ ...s, firstName: v }))}
        />
        <SectionLabel>{t("admin.clients.placeholderLastName")}</SectionLabel>
        <Input
          placeholder={t("admin.clients.placeholderLastName")}
          value={form.lastName}
          onChangeText={(v) => setForm((s) => ({ ...s, lastName: v }))}
        />
        <SectionLabel>{t("admin.clients.placeholderPhoneRequired")}</SectionLabel>
        <Input
          placeholder={t("admin.clients.placeholderPhoneRequired")}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(v) => setForm((s) => ({ ...s, phone: v }))}
        />
        {showDateOfBirth ? (
          <>
            <SectionLabel>{t("admin.clients.labelDateOfBirth")}</SectionLabel>
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <DateTimePicker
                  testID="edit-client-dob-input"
                  mode="date"
                  value={form.dateOfBirth}
                  onChange={(d) => setForm((s) => ({ ...s, dateOfBirth: d }))}
                  placeholder={t("admin.clients.placeholderDateOfBirth")}
                  maximumDate={now()}
                  minimumDate={new Date(Date.UTC(1900, 0, 1))}
                />
              </View>
              {form.dateOfBirth ? (
                <Pressable
                  testID="edit-client-dob-clear"
                  onPress={() => setForm((s) => ({ ...s, dateOfBirth: null }))}
                  accessibilityRole="button"
                  accessibilityLabel={t("admin.clients.dateOfBirthEmpty")}
                  style={{ padding: 8 }}
                >
                  <Text className="text-foreground">×</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
        <SectionLabel>{t("admin.clients.placeholderNotes")}</SectionLabel>
        <Input
          placeholder={t("admin.clients.placeholderNotes")}
          multiline
          value={form.notes}
          onChangeText={(v) => setForm((s) => ({ ...s, notes: v }))}
        />
        <View className="flex-row items-center gap-3 py-2">
          <Text className="text-foreground" style={{ fontSize: 15 }}>
            {t("admin.clients.active")}
          </Text>
          <Switch
            value={form.isActive}
            onValueChange={(v) => setForm((s) => ({ ...s, isActive: v }))}
            trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
          />
        </View>
        <Button
          disabled={updateClientMutation.isPending}
          onPress={() =>
            client &&
            updateClientMutation.mutate(
              {
              id: client.id,
              firstName: form.firstName,
              lastName: form.lastName,
              phone: form.phone || undefined,
              notes: form.notes || undefined,
              isActive: form.isActive,
              // Sent only for entities that carry the key — the klijenti
              // list flow never sent it, and an unconditional `null` here
              // would silently clear the client's DOB.
              ...("dateOfBirth" in client
                ? {
                    dateOfBirth: form.dateOfBirth
                      ? toIsoDate(form.dateOfBirth)
                      : null,
                  }
                : {}),
              },
              { onSuccess: onClose },
            )
          }
        >
          {t("admin.clients.save")}
        </Button>
        {updateClientMutation.isError ? <ErrorState message={t("admin.clients.updateError")} /> : null}
      </View>
    </AppSheet>
  );
}
