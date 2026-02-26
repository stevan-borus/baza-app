import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

export default function TrainerClients() {
  const { t } = useTranslation();
  const clientsQuery = useQuery(clientsQueries.list());
  const sessionsQuery = useQuery(sessionsQueries.list());
  const dateLocale = getDateLocale();

  const clients = clientsQuery.data?.clients ?? [];
  const scheduledSessions = (sessionsQuery.data?.sessions ?? []).filter(
    (s) => s.status === "SCHEDULED",
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
          <YStack gap="$4" pb="$8">
            {scheduledSessions.map((session) => (
              <YStack key={session.id} gap="$2">
                <Card>
                  <YStack gap="$2">
                    <XStack justify="space-between" items="center">
                      <Text fontWeight="600" fontSize="$3" color="$color">
                        {session.classType?.name ??
                          t("trainer.clients.sessionName")}
                      </Text>
                      <Badge variant="soft">
                        {t("trainer.clients.seats", {
                          count: session.capacity,
                        })}
                      </Badge>
                    </XStack>
                    <Text fontSize="$2" color="$color10">
                      {new Date(session.startsAt).toLocaleDateString(
                        dateLocale,
                      )}{" "}
                      {new Date(session.startsAt).toLocaleTimeString(
                        dateLocale,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </Text>
                  </YStack>
                </Card>
                {clients.length > 0 ? (
                  <YStack ml="$4" gap="$1.5">
                    {clients.map((client) => (
                      <Card key={client.id}>
                        <YStack gap="$1">
                          <Text fontWeight="500" fontSize="$3" color="$color">
                            {client.user.fullName}
                          </Text>
                          <Text fontSize="$2" color="$color10">
                            {client.user.email}
                          </Text>
                          {client.notes ? (
                            <Text fontSize="$2" color="$color9">
                              {t("admin.clients.notes", { text: client.notes })}
                            </Text>
                          ) : null}
                        </YStack>
                      </Card>
                    ))}
                  </YStack>
                ) : (
                  <Text color="$color9" ml="$4" fontSize="$2">
                    {t("trainer.clients.noClients")}
                  </Text>
                )}
              </YStack>
            ))}
          </YStack>
        )}
      </ScreenContainer>
    </ScrollView>
  );
}

