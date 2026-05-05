/**
 * Training history — full list of trainer notes for the current client.
 * Pushed from the Profile tab summary; renders inside the profile stack.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { ScreenContainer } from "@/components/ui/screen-container";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { getDateLocale } from "@/lib/i18n";

export default function ClientTrainingHistory() {
  const { t } = useTranslation();
  useThemeTokens(); // ensure subtree subscribes to theme changes
  const dateLocale = getDateLocale();
  const notesQuery = useQuery(trainerNotesQueries.list());
  const notes = notesQuery.data?.notes ?? [];

  return (
    <ScreenContainer
      title={t("client.profileTab.trainingHistory")}
      headerVariant="detail"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {notesQuery.isLoading ? (
          <SkeletonList count={4} />
        ) : notesQuery.isError ? (
          <ErrorState message={t("client.history.error")} />
        ) : notes.length === 0 ? (
          <EmptyState title={t("client.history.noNotes")} />
        ) : (
          <GlassCard>
            <View className="flex-col gap-3">
              {notes.map((note: TrainerNote) => (
                <ListRow
                  key={note.id}
                  title={note.note}
                  subtitle={`${new Date(note.createdAt).toLocaleDateString(dateLocale)}${note.trainer ? ` · ${note.trainer.fullName}` : ""}`}
                />
              ))}
            </View>
          </GlassCard>
        )}
        {notes.length === 0 ? null : (
          <Text className="text-faint text-center text-xs mt-2">
            {t("client.profileTab.totalNotes")}: {notes.length}
          </Text>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
