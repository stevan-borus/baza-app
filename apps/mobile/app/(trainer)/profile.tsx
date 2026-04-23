import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
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
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#2e5b42"
          colors={["#2e5b42"]}
        />
      }
    >
      <ScreenContainer>
        {/* Header: Avatar + Email */}
        <View className="items-center gap-3 pb-4">
          <View
            className="items-center justify-center"
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text className="text-accent font-bold" style={{ fontSize: 24 }}>
              {userEmail.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="items-center gap-1">
            <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
              {userEmail.split("@")[0]}
            </Text>
            <Text className="text-[13px] text-muted">
              {userEmail}
            </Text>
          </View>
        </View>

        {/* Preferences */}
        <View className="flex-col gap-4">
          <SectionLabel>{t("client.profileTab.preferences")}</SectionLabel>
          <GlassCard>
            <View className="flex-col gap-4">
              <Text className="text-base text-foreground">
                {t("client.profileTab.language")}
              </Text>
              <LanguageSwitcher />
            </View>
          </GlassCard>
        </View>

        {/* Account */}
        <View className="flex-col gap-4">
          <SectionLabel>{t("client.profileTab.account")}</SectionLabel>
          <Button
            variant="danger"
            onPress={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            {t("client.signOut")}
          </Button>
        </View>
      </ScreenContainer>
    </ScrollView>
  );
}
