/**
 * Trainer per-client profile.
 *
 * Pushed from a row tap on the trainer Clients roster. Fetches `/api/clients/:id`,
 * which the server scopes by trainer→client linkage (active booking). When the
 * trainer is not linked, the API returns 403 and we render an explicit error
 * card — never the client's data.
 *
 * The "Beleške" section shows TrainerNote records (timestamped log entries
 * created from the Notes tab) — NOT the legacy `ClientProfile.notes`
 * single-string field. Trainers expect to see what they actually wrote.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { GlassCard } from "@/components/ui/glass-card";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import {
  ClientForbiddenError,
  clientsQueries,
} from "@/lib/queries/clients-queries-factory";
import {
  trainerNotesQueries,
  type TrainerNote,
} from "@/lib/queries/trainer-notes-queries-factory";

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The screen body, exported so other routes (e.g. the sessions-stack
 * variant at `/(trainer)/raspored/sessions/clients/[id]`) can render the same
 * profile without duplicating fetch/UI code. Back behavior is governed
 * by which stack the route lives in, not by this component.
 */
export function TrainerClientProfile() {
  const { t } = useTranslation();
  useThemeTokens();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    ...clientsQueries.byId(id ?? ""),
    enabled: Boolean(id),
  });

  const isForbidden = query.error instanceof ClientForbiddenError;

  return (
    <ScreenContainer
      title={t("trainer.clients.profileTitle")}
      headerVariant="detail"
      testID="trainer-client-profile"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {query.isLoading ? (
          <SkeletonList count={3} />
        ) : isForbidden ? (
          <View testID="trainer-client-profile-error">
            <ErrorState message={t("trainer.clients.notLinkedError")} />
          </View>
        ) : query.isError ? (
          <ErrorState message={t("trainer.clients.error")} />
        ) : query.data ? (
          <ProfileBody client={query.data.client} />
        ) : (
          <EmptyState title={t("trainer.clients.noClients")} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function ProfileBody({
  client,
}: {
  client: {
    id: string;
    user: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      isActive: boolean;
    };
  };
}) {
  const { t } = useTranslation();
  const initials = getInitials(client.user.fullName);
  const dateLocale = getDateLocale();

  // TrainerNote records for this client. Server scopes by role: a TRAINER
  // sees only their own notes; the screen itself is already gated by the
  // trainer-client linkage check on the parent query, so an empty list
  // means "no notes from this trainer yet for this client".
  //
  // take=100 (max) — a single trainer's history with one client is
  // realistically dozens, rarely hundreds; one page covers it without
  // wiring infinite scroll on a screen that's already a ScrollView.
  const notesQuery = useQuery(
    trainerNotesQueries.list({ clientProfileId: client.id, take: 100 }),
  );
  const notes = notesQuery.data?.notes ?? [];

  return (
    <View className="gap-4">
      {/* Identity card */}
      <GlassCard>
        <View className="flex-row items-center gap-4">
          <View
            className="rounded-full items-center justify-center"
            style={{
              width: 56,
              height: 56,
              backgroundColor: "rgba(46,91,66,0.22)",
            }}
          >
            <Text
              className="font-body-bold"
              style={{ color: "#4caf80", fontSize: 18 }}
            >
              {initials}
            </Text>
          </View>

          <View className="flex-1 flex-col gap-1">
            <Text
              className="font-body-semibold text-foreground text-lg"
              numberOfLines={1}
            >
              {client.user.fullName}
            </Text>
            <Text className="text-sm text-muted" numberOfLines={1}>
              {client.user.email}
            </Text>
            {client.user.phone ? (
              <Text className="text-sm text-muted" numberOfLines={1}>
                {client.user.phone}
              </Text>
            ) : null}
          </View>
        </View>
      </GlassCard>

      {/* Trainer notes — timestamped records for this client */}
      <View className="gap-2">
        <Text className="font-body-semibold text-foreground text-base">
          {t("trainer.clients.notesLabel")}
        </Text>
        {notesQuery.isLoading ? (
          <SkeletonList count={2} />
        ) : notes.length === 0 ? (
          <GlassCard>
            <Text className="text-sm text-faint">
              {t("trainer.clients.notesEmpty")}
            </Text>
          </GlassCard>
        ) : (
          notes.map((n) => (
            <TrainerNoteRow key={n.id} note={n} dateLocale={dateLocale} />
          ))
        )}
      </View>
    </View>
  );
}

function TrainerNoteRow({
  note,
  dateLocale,
}: {
  note: TrainerNote;
  dateLocale: string;
}) {
  const dateStr = new Date(note.createdAt).toLocaleDateString(dateLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <GlassCard size="md" accentBorder="left">
      <View style={{ gap: 6 }}>
        <Text
          className="text-foreground"
          style={{ fontSize: 14, lineHeight: 20, opacity: 0.9 }}
        >
          {note.note}
        </Text>
        <Text className="text-muted" style={{ fontSize: 11 }}>
          {dateStr}
        </Text>
      </View>
    </GlassCard>
  );
}

export default TrainerClientProfile;
