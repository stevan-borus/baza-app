import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "./sheet";
import { Button } from "./button";

type ConfirmSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Optional cancel label override (defaults to t("common.cancel")). */
  cancelLabel?: string;
  /** Visual tone of the confirm button. Defaults to "danger". */
  tone?: "danger" | "primary";
  loading?: boolean;
  /** Optional inline error rendered above the buttons. */
  errorMessage?: string | null;
  /** Optional testID forwarded to the confirm Button. */
  testID?: string;
  onConfirm: () => void;
};

/**
 * Reusable confirmation bottom sheet for destructive or other irreversible
 * actions. The sheet stays open while `loading` is true; the caller is
 * responsible for closing it on success (typically inside the mutation's
 * `onSuccess`).
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  loading = false,
  errorMessage,
  testID,
  onConfirm,
}: ConfirmSheetProps) {
  const { t } = useTranslation();

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text
          className="text-foreground font-display"
          style={{ fontSize: 22, lineHeight: 28 }}
        >
          {title}
        </Text>
        {message ? (
          <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
            {message}
          </Text>
        ) : null}
        {errorMessage ? (
          <Text className="text-danger" style={{ fontSize: 13, lineHeight: 18 }}>
            {errorMessage}
          </Text>
        ) : null}
        <View className="flex-col gap-2 mt-2">
          <Button
            testID={testID}
            variant={tone}
            disabled={loading}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="ghost"
            disabled={loading}
            onPress={() => onOpenChange(false)}
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
        </View>
      </View>
    </AppSheet>
  );
}
