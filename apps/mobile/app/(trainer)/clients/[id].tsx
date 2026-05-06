/**
 * Trainer per-client profile.
 *
 * Pushed from a row tap on the trainer Clients roster. Fetches `/api/clients/:id`,
 * which the server scopes by trainer→client linkage (active booking). When the
 * trainer is not linked, the API returns 403 and we render an explicit error
 * card — never the client's data.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ClientForbiddenError,
  clientsQueries,
} from "@/lib/queries/clients-queries-factory";

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const STATUS_BADGE: Record<
  "active" | "expiring" | "expired" | "paused" | "none",
  { tone: "success" | "warning" | "neutral"; key: string }
> = {
  active: { tone: "success", key: "admin.clients.filterActive" },
  expiring: { tone: "warning", key: "admin.clients.filterExpiring" },
  expired: { tone: "warning", key: "admin.clients.filterExpired" },
  paused: { tone: "neutral", key: "admin.clients.filterPaused" },
  none: { tone: "neutral", key: "admin.clients.filterAll" },
};

export default function TrainerClientProfile() {
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
    notes: string | null;
    packageStatus: "active" | "expiring" | "expired" | "paused" | "none";
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
  const badge = STATUS_BADGE[client.packageStatus];

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

        <View className="flex-row gap-2 mt-4 flex-wrap">
          {client.packageStatus !== "none" ? (
            <Badge status={badge.tone}>{t(badge.key)}</Badge>
          ) : null}
          <Badge status={client.user.isActive ? "success" : "neutral"}>
            {client.user.isActive
              ? t("trainer.clients.statusActive")
              : t("trainer.clients.statusInactive")}
          </Badge>
        </View>
      </GlassCard>

      {/* Notes */}
      <GlassCard>
        <Text className="font-body-semibold text-foreground text-base mb-2">
          {t("trainer.clients.notesLabel")}
        </Text>
        {client.notes ? (
          <Text className="text-sm text-muted leading-5">{client.notes}</Text>
        ) : (
          <Text className="text-sm text-faint">
            {t("trainer.clients.notesEmpty")}
          </Text>
        )}
      </GlassCard>
    </View>
  );
}
