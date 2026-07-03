// Per-row actions flow — the sheet opened by the pencil on a klijenti list
// row, extracted from app/(admin)/klijenti/index.tsx. Owns the action rows
// AND the delete-client confirmation sheet (delete is this flow's own
// terminal step); every other action is surfaced as a callback so the
// SCREEN decides which sheet opens next — cross-flow choreography stays
// out of this module.
//
// Entity-as-prop choice: the screen live-derives `client` from the loaded
// list by the open id (exactly what the old inline render-prop's
// `clients.find` did), so the sheet can be open with a null client and
// render empty — preserved via the separate `open` flag.
//
// Delete details (preserved from the screen-era code):
// - Deleting is a soft-delete: PATCH /api/clients/:userId with
//   isActive: false via clientsQueries.update(). NOTE the target id is the
//   USER id (client.user.id), while the edit flow PATCHes the ClientProfile
//   id — that asymmetry is inherited verbatim from the old screen.
// - The confirm sheet closes immediately on press; the mutation resolves in
//   the background and invalidates the clients list on success.
// - The delete target is snapshotted when "Obriši" is pressed (the actions
//   sheet is already closed by then, so there is no live row to derive from).

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";
import { InitialsAvatar } from "@/components/admin/client-flows/initials-avatar";
import { useUpdateClientMutation } from "@/lib/queries/clients-queries-factory";

export type ClientActionsSheetClient = {
  /** ClientProfile id — what the follow-up flows (edit/assign/pause) key on. */
  id: string;
  user: { id: string; fullName: string; email: string };
};

export type ClientActionsSheetProps = {
  /**
   * Mirrors the old `!!showActionsFor`: the sheet can be "open" while
   * `client` is still null (row not in the loaded pages) and renders empty.
   */
  open: boolean;
  client: ClientActionsSheetClient | null;
  onClose: () => void;
  onEditClient: (clientProfileId: string) => void;
  onNewPayment: (clientProfileId: string) => void;
  onAssignPackage: (clientProfileId: string) => void;
  onPause: (clientProfileId: string) => void;
};

export function ClientActionsSheet({
  open,
  client,
  onClose,
  onEditClient,
  onNewPayment,
  onAssignPackage,
  onPause,
}: ClientActionsSheetProps) {
  const { t } = useTranslation();

  // Delete confirmation — separate from the actions sheet so a stray tap
  // can't soft-delete a client. Snapshot of the row taken at "Obriši" press.
  const [deleteTarget, setDeleteTarget] = useState<ClientActionsSheetClient | null>(null);

  // Cache upkeep (clients + reports counts) is baked into the factory hook.
  const deactivateMutation = useUpdateClientMutation();

  return (
    <>
      {/* Actions sheet — opens when a client row is tapped. Avoids
          stacking 3+ inline action buttons under every row. */}
      <AppSheet
        open={open}
        onOpenChange={(o) => !o && onClose()}
        stackBehavior="push"
      >
        {client ? (
          <View className="flex-col gap-2">
            <View className="flex-row items-center gap-3 pb-3">
              <InitialsAvatar name={client.user.fullName} />
              <View className="flex-1 gap-0.5">
                <Text
                  className="text-foreground font-body-semibold"
                  style={{ fontSize: 16 }}
                  numberOfLines={1}
                >
                  {client.user.fullName}
                </Text>
                <Text
                  className="text-muted"
                  style={{ fontSize: 12 }}
                  numberOfLines={1}
                >
                  {client.user.email}
                </Text>
              </View>
            </View>
            <View className="bg-glass-border" style={{ height: 1 }} />
            <ActionRow
              testID="client-action-edit"
              icon="edit-2"
              label={t("admin.clients.edit")}
              onPress={() => {
                onClose();
                onEditClient(client.id);
              }}
            />
            <ActionRow
              testID="client-action-new-payment"
              icon="dollar-sign"
              label={t("admin.clients.newPaymentAction")}
              onPress={() => {
                onClose();
                onNewPayment(client.id);
              }}
            />
            <ActionRow
              testID="client-action-assign-package"
              icon="gift"
              label={t("admin.clients.assignPackage")}
              onPress={() => {
                onClose();
                onAssignPackage(client.id);
              }}
            />
            <ActionRow
              testID="client-action-pause"
              icon="pause"
              label={t("admin.clients.pause")}
              onPress={() => {
                onClose();
                onPause(client.id);
              }}
            />
            <ActionRow
              testID="client-action-delete"
              icon="trash-2"
              label={t("admin.clients.delete")}
              destructive
              onPress={() => {
                onClose();
                setDeleteTarget(client);
              }}
            />
          </View>
        ) : null}
      </AppSheet>

      {/* Delete confirmation sheet — separate from the actions sheet
          so an accidental tap on "Obriši" doesn't immediately wipe a
          client. The mutation only runs from the destructive button. */}
      <AppSheet
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        stackBehavior="push"
      >
        {deleteTarget ? (
          <View className="flex-col gap-5">
            <View className="items-center gap-3 pt-1">
              <View className="w-12 h-12 rounded-full bg-danger-soft items-center justify-center">
                <Icon name="alert-triangle" size={20} color="#dc2626" />
              </View>
              <Text
                className="text-foreground font-body-bold text-center"
                style={{ fontSize: 18, letterSpacing: -0.3 }}
              >
                {deleteTarget.user.fullName}
              </Text>
              <Text
                className="text-muted text-center"
                style={{ fontSize: 14, lineHeight: 20 }}
              >
                {t("admin.clients.deleteConfirm")}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onPress={() => setDeleteTarget(null)}
              >
                {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
              </Button>
              <Button
                testID="client-delete-confirm-button"
                variant="danger"
                className="flex-1"
                onPress={() => {
                  deactivateMutation.mutate({
                    id: deleteTarget.user.id,
                    isActive: false,
                  });
                  setDeleteTarget(null);
                }}
              >
                {t("admin.clients.delete")}
              </Button>
            </View>
          </View>
        ) : null}
      </AppSheet>
    </>
  );
}

// ─── ActionRow ───────────────────────────────────────────────────────────────
// Icon + label + chevron, full width, hairline-divided. Destructive variant
// tints icon + label red. Moved verbatim with the actions sheet.

function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  const t = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={null}
      className="flex-row items-center gap-3 py-3.5 active:opacity-70"
    >
      <Icon
        name={icon}
        size={18}
        color={destructive ? "#dc2626" : t.foreground}
      />
      <Text
        className={
          destructive
            ? "text-danger font-body-medium flex-1"
            : "text-foreground font-body-medium flex-1"
        }
        style={{ fontSize: 15 }}
      >
        {label}
      </Text>
      {!destructive ? (
        <Icon name="chevron-right" size={16} color={t.faint} />
      ) : null}
    </Pressable>
  );
}
