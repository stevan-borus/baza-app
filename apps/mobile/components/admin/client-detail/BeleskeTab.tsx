import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { PaginatedList } from "@/components/ui/paginated-list";
import {
  trainerNotesQueries,
  useDeleteTrainerNoteMutation,
  type TrainerNote,
} from "@/lib/queries/trainer-notes-queries-factory";

export function BeleskeTab({
  clientProfileId,
  lang,
  bottomPad,
}: {
  clientProfileId: string;
  lang: "sr" | "en";
  bottomPad: number;
}) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<TrainerNote | null>(null);

  const notesQuery = useInfiniteQuery(
    trainerNotesQueries.listInfinite({ clientProfileIds: [clientProfileId] }),
  );
  const notes = (notesQuery.data?.pages ?? []).flatMap((p) => p.notes);

  const deleteMutation = useDeleteTrainerNoteMutation();

  return (
    <View
      testID="client-detail-tab-content-beleske"
      style={{ flex: 1, paddingHorizontal: 20 }}
    >
      <PaginatedList<TrainerNote>
        query={notesQuery}
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <Pressable
            testID={`beleske-row-${item.id}`}
            onPress={() => setPendingDelete(item)}
            android_ripple={null}
            className="bg-surface rounded-lg overflow-hidden active:opacity-80"
            style={{ marginBottom: 8, padding: 14 }}
          >
            <Text
              className="text-faint font-body-semibold"
              style={{
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
              numberOfLines={1}
            >
              {item.trainer?.fullName ?? t("admin.clientDetail.beleske.unknownTrainer")} ·{" "}
              {dayjs(item.createdAt).locale(lang).format("D.M.YYYY.")}
            </Text>
            <Text
              className="text-foreground"
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {item.note}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        errorState={
          <ErrorState message={t("admin.clientDetail.beleske.error")} />
        }
        emptyState={
          <EmptyState title={t("admin.clientDetail.beleske.empty")} />
        }
      />

      {/* Tap-to-delete confirmation. The only thing an admin does to a
          note from this surface is remove it — tap on row → confirm.
          The trainer who wrote the note is not notified of deletion. */}
      <ConfirmSheet
        testID="beleske-confirm-delete"
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title={t("admin.clientDetail.beleske.confirmDelete")}
        message={t("admin.clientDetail.beleske.confirmDeleteBody")}
        confirmLabel={t("admin.clientDetail.beleske.confirm")}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
      />
    </View>
  );
}
