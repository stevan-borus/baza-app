// Assign-package flow — the sheet wrapper around AssignPackageSheetContent,
// extracted from app/(admin)/klijenti/index.tsx. The content component
// already owns the form + comp/paid mutations; this module adds the sheet
// chrome (AppSheet + SheetHeader) so the screen only threads
// `{ clientId, mode, initialPackageTypeId }`.
//
// Entity-as-prop choice: like the old inline sheet, the target row is
// LIVE-derived by the screen from the loaded list (`clients.find`), not
// snapshotted — the deep-link entry can arrive before the row has loaded,
// and the sheet must stay closed until it appears (see the open gate below).

import React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import {
  AssignPackageSheetContent,
  type AssignPackageMode,
  type AssignPackageSheetContentProps,
} from "@/components/admin/assign-package-sheet-content";
import { SheetHeader } from "@/components/admin/client-flows/sheet-header";

export type AssignPackageSheetClient = AssignPackageSheetContentProps["client"];

export type AssignPackageSheetProps = {
  /**
   * The target row, or null when the flow is idle OR the requested client
   * isn't in the loaded page set yet. The sheet is open exactly while this
   * is non-null — keeping it closed until the targeted client is loaded
   * avoids the bottom-sheet's dynamic sizing getting stuck at ~0 (the
   * "peeking strip" bug seen when arriving via deep-link before clients
   * had loaded).
   */
  client: AssignPackageSheetClient | null;
  /** "comp" = Dodeli paket (gift), "paid" = Nova uplata (billing path). */
  mode: AssignPackageMode;
  /**
   * Deep-link pre-selection for the PackageType picker — only set on the
   * first sheet open after a deep-link, cleared with the flow.
   */
  initialPackageTypeId?: string;
  /**
   * Deep-link pre-selection for the birthday-gift class-type picker — the
   * class type the gift should cover. Only meaningful when the selected SKU is
   * a birthday gift; ignored otherwise.
   */
  initialClassTypeId?: string;
  onClose: () => void;
  /** Back chevron — the SCREEN decides where "back" goes (actions sheet). */
  onBack: () => void;
};

export function AssignPackageSheet({
  client,
  mode,
  initialPackageTypeId,
  initialClassTypeId,
  onClose,
  onBack,
}: AssignPackageSheetProps) {
  const { t } = useTranslation();

  return (
    <AppSheet
      stackBehavior="push"
      open={client !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {client ? (
        <View className="flex-col gap-4">
          <SheetHeader
            title={
              mode === "paid"
                ? t("admin.clients.newPaymentAction")
                : t("admin.clients.sheetAssign")
            }
            onBack={onBack}
          />
          <AssignPackageSheetContent
            client={client}
            mode={mode}
            initialPackageTypeId={initialPackageTypeId}
            initialClassTypeId={initialClassTypeId}
            onSuccess={onClose}
          />
        </View>
      ) : null}
    </AppSheet>
  );
}
