import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, YStack } from "tamagui";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";

export default function TrainerProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const meQuery = useQuery(authQueries.me());
  const userEmail = meQuery.data?.user.email ?? "";

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: async () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["auth"] });
    setRefreshing(false);
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <ScreenContainer>
        {/* Header: Avatar + Email */}
        <YStack items="center" gap="$3" pb="$4">
          <YStack
            width={60}
            height={60}
            borderRadius={30}
            bg="$backgroundHover"
            items="center"
            justify="center"
          >
            <Text fontSize={24} fontWeight="700" color="$accent1">
              {userEmail.charAt(0).toUpperCase()}
            </Text>
          </YStack>
          <YStack items="center" gap="$1">
            <Text fontSize="$5" fontWeight="700" color="$color">
              {userEmail.split("@")[0]}
            </Text>
            <Text fontSize="$2" color="$color9">
              {userEmail}
            </Text>
          </YStack>
        </YStack>

        {/* Preferences */}
        <YStack gap="$4">
          <SectionLabel>{t("client.profileTab.preferences")}</SectionLabel>
          <GlassCard>
            <YStack gap="$4">
              <Text fontSize="$3" color="$color">
                {t("client.profileTab.language")}
              </Text>
              <LanguageSwitcher />
            </YStack>
          </GlassCard>
        </YStack>

        {/* Account */}
        <YStack gap="$4">
          <SectionLabel>{t("client.profileTab.account")}</SectionLabel>
          <Button
            variant="danger"
            onPress={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            {t("client.signOut")}
          </Button>
        </YStack>
      </ScreenContainer>
    </ScrollView>
  );
}
