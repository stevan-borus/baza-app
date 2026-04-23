import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

export default function TrainerClients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const clientsQuery = useQuery(clientsQueries.list());
  const sessionsQuery = useQuery(sessionsQueries.list());
  const dateLocale = getDateLocale();

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);
    setRefreshing(false);
  }

  const clients = clientsQuery.data?.clients ?? [];
  const scheduledSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (s) => s.status === "SCHEDULED",
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <ScreenContainer>
        <SectionHeader title={t("trainer.clients.title")} />

        {clientsQuery.isError ? (
          <ErrorState message={t("trainer.clients.error")} />
        ) : null}
        {sessionsQuery.isError ? (
          <ErrorState message={t("trainer.clients.sessionsError")} />
        ) : null}

        {scheduledSessions.length === 0 ? (
          <EmptyState title={t("trainer.clients.noSessions")} />
        ) : (
          <View className="flex-col gap-5 pb-8">
            {scheduledSessions.map((session) => (
              <View key={session.id} className="flex-col gap-2">
                <Card>
                  <View className="flex-col gap-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="font-semibold text-lg text-foreground">
                        {session.classType?.name ??
                          t("trainer.clients.sessionName")}
                      </Text>
                      <Badge status="neutral">
                        {t("trainer.clients.seats", {
                          count: session.capacity,
                        })}
                      </Badge>
                    </View>
                    <Text className="text-sm text-muted">
                      {new Date(session.startsAt).toLocaleDateString(
                        dateLocale,
                      )}{" "}
                      {new Date(session.startsAt).toLocaleTimeString(
                        dateLocale,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </Text>
                  </View>
                </Card>
                {clients.length > 0 ? (
                  <View className="flex-col ml-4 gap-1.5">
                    {clients.map((client) => (
                      <Card key={client.id}>
                        <View className="flex-col gap-1">
                          <Text className="font-medium text-lg text-foreground">
                            {client.user.fullName}
                          </Text>
                          <Text className="text-sm text-muted">
                            {client.user.email}
                          </Text>
                          {client.notes ? (
                            <Text className="text-sm text-muted">
                              {t("admin.clients.notes", { text: client.notes })}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    ))}
                  </View>
                ) : (
                  <Text className="text-muted ml-4 text-sm">
                    {t("trainer.clients.noClients")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScreenContainer>
    </ScrollView>
  );
}
