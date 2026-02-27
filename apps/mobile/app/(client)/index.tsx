import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, XStack, YStack } from "tamagui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Badge, Card, StatCard } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionHeader, SectionLabel } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";

export default function ClientOverview() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());
  const dateLocale = getDateLocale();

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: async () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) => p.sessionsRemaining > 0 && new Date(p.expiresAt) > new Date(),
  );
  const notes = notesQuery.data?.notes ?? [];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ScreenContainer>
        {meQuery.data ? (
          <SectionHeader
            title={t("client.profile.myProfile")}
            subtitle={meQuery.data.user.email}
          />
        ) : meQuery.isError ? (
          <ErrorState message={t("client.profile.error")} />
        ) : null}

        {/* Active Package */}
        <YStack gap="$6">
          <SectionLabel>{t("client.package.myPackage")}</SectionLabel>
          {packagesQuery.isError ? <ErrorState message={t("client.package.error")} /> : null}
          {activePackage ? (
            <YStack gap="$4">
              <XStack justify="space-between" items="center">
                <Text fontWeight="600" fontSize="$4" color="$color">
                  {activePackage.packageType?.name ?? t("client.package.packageName")}
                </Text>
                <Badge variant="soft">{t("client.package.active")}</Badge>
              </XStack>
              <XStack gap="$3">
                <YStack flex={1}>
                  <StatCard
                    label={t("client.package.sessionsRemaining")}
                    value={activePackage.sessionsRemaining}
                  />
                </YStack>
                <YStack flex={1}>
                  <StatCard
                    label={t("client.package.validUntil")}
                    value={new Date(activePackage.expiresAt).toLocaleDateString(dateLocale)}
                  />
                </YStack>
              </XStack>
            </YStack>
          ) : (
            <EmptyState title={t("client.package.noActive")} />
          )}
        </YStack>

        {/* All Packages */}
        {packages.length > 1 ? (
          <YStack gap="$4">
            <SectionLabel>{t("client.package.allPackages")}</SectionLabel>
            {packages.map((pkg: ClientPackage) => (
              <Card key={pkg.id}>
                <XStack justify="space-between" items="center">
                  <Text fontWeight="500" color="$color">
                    {pkg.packageType?.name ?? t("client.package.packageName")}
                  </Text>
                </XStack>
                <Text fontSize="$2" color="$color9" mt="$1">
                  {t("client.package.sessionsUntil", {
                    count: pkg.sessionsRemaining,
                    date: new Date(pkg.expiresAt).toLocaleDateString(dateLocale),
                  })}
                </Text>
              </Card>
            ))}
          </YStack>
        ) : null}

        {/* Training History */}
        <YStack gap="$4">
          <SectionLabel>{t("client.history.title")}</SectionLabel>
          {notesQuery.isError ? <ErrorState message={t("client.history.error")} /> : null}
          {notes.length === 0 ? (
            <EmptyState title={t("client.history.noNotes")} />
          ) : (
            <Card>
              <YStack gap="$4">
                {notes.slice(0, 20).map((note: TrainerNote) => (
                  <YStack key={note.id} py="$1">
                    <Text fontWeight="500" fontSize="$3" color="$color">
                      {note.note}
                    </Text>
                    <XStack gap="$2" mt="$1.5" items="center">
                      <Text fontSize="$1" color="$color9">
                        {new Date(note.createdAt).toLocaleDateString(dateLocale)}
                      </Text>
                      {note.trainer ? (
                        <>
                          <Text fontSize="$1" color="$color9">
                            ·
                          </Text>
                          <Text fontSize="$1" color="$color10">
                            {note.trainer.fullName}
                          </Text>
                        </>
                      ) : null}
                    </XStack>
                  </YStack>
                ))}
              </YStack>
            </Card>
          )}
        </YStack>

        {/* Settings */}
        <YStack gap="$4">
          <SectionLabel>{t("settings.language")}</SectionLabel>
          <Card>
            <YStack gap="$4">
              <LanguageSwitcher />
              <Button
                variant="secondary"
                onPress={() => signOutMutation.mutate()}
              >
                {t("client.signOut")}
              </Button>
            </YStack>
          </Card>
        </YStack>
        <YStack items="center" pt="$4">
          <Image
            source={require("@/assets/images/logo-green.png")}
            style={{ width: 80, height: 28 }}
            contentFit="contain"
          />
        </YStack>
      </ScreenContainer>
    </ScrollView>
  );
}
