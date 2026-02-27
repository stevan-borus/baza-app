import { useState } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { LegendList } from "@legendapp/list";
import { Text, XStack, YStack } from "tamagui";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionHeader, SectionLabel } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

export default function TrainerNotes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ sessionId: "", clientProfileId: "", note: "" });
  const dateLocale = getDateLocale();

  const notesQuery = useInfiniteQuery(trainerNotesQueries.listInfinite());
  const sessionsQuery = useQuery(sessionsQueries.list());
  const clientsQuery = useQuery(clientsQueries.list());

  const createMutation = useMutation({
    ...trainerNotesQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
      setShowCreate(false);
      setForm({ sessionId: "", clientProfileId: "", note: "" });
    },
  });

  const notes = notesQuery.data?.pages.flatMap((p) => p.notes) ?? [];

  function handleEndReached() {
    if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) notesQuery.fetchNextPage();
  }

  return (
    <ScreenContainerRaw>
      <YStack px="$5" gap="$4">
        <SectionHeader title={t("trainer.notes.title")} />
        <ActionButton icon="plus" label={t("trainer.notes.newNote")} onPress={() => setShowCreate(true)} />
      </YStack>

      {notesQuery.isError ? (
        <YStack px="$5" pt="$3">
          <ErrorState message={t("trainer.notes.error")} />
        </YStack>
      ) : null}
      {notes.length === 0 && !notesQuery.isLoading ? (
        <YStack px="$5" pt="$3">
          <EmptyState title={t("trainer.notes.empty")} />
        </YStack>
      ) : null}

      <YStack flex={1} px="$5" pt="$2">
        <LegendList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: TrainerNote }) => (
            <YStack py="$1.5">
              <Card>
                <YStack gap="$1.5">
                  <Text fontWeight="500" fontSize="$3" color="$color">
                    {item.note}
                  </Text>
                  <XStack gap="$2" items="center">
                    <Text fontSize="$1" color="$color9">
                      {new Date(item.createdAt).toLocaleDateString(dateLocale)}
                    </Text>
                    {item.trainer ? (
                      <>
                        <Text fontSize="$1" color="$color9">·</Text>
                        <Text fontSize="$1" color="$color10">
                          {item.trainer.fullName}
                        </Text>
                      </>
                    ) : null}
                  </XStack>
                </YStack>
              </Card>
            </YStack>
          )}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={notesQuery.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} /> : null}
          estimatedItemSize={80}
        />
      </YStack>

      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <YStack gap="$5">
          <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
            {t("trainer.notes.sheetTitle")}
          </Text>

          <SectionLabel>{t("trainer.notes.session")}</SectionLabel>
          {(sessionsQuery.data?.sessions ?? []).slice(0, 10).map((s) => (
            <Button
              key={s.id}
              size="small"
              variant={form.sessionId === s.id ? "primary" : "secondary"}
              onPress={() => setForm((f) => ({ ...f, sessionId: s.id }))}
            >
              {s.classType?.name ?? t("trainer.clients.sessionName")} - {new Date(s.startsAt).toLocaleDateString(dateLocale)}
            </Button>
          ))}

          <SectionLabel>{t("trainer.notes.client")}</SectionLabel>
          {(clientsQuery.data?.clients ?? []).map((c) => (
            <Button
              key={c.id}
              size="small"
              variant={form.clientProfileId === c.id ? "primary" : "secondary"}
              onPress={() => setForm((f) => ({ ...f, clientProfileId: c.id }))}
            >
              {c.user.fullName}
            </Button>
          ))}

          <Input
            placeholder={t("trainer.notes.placeholder")}
            multiline
            numberOfLines={3}
            value={form.note}
            onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
          />
          <Button disabled={createMutation.isPending || !form.sessionId || !form.clientProfileId || !form.note} onPress={() => createMutation.mutate(form)}>
            {t("admin.clients.save")}
          </Button>
          {createMutation.isError ? <ErrorState message={t("trainer.notes.saveError")} /> : null}
        </YStack>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
