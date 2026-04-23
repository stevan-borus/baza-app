import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";

function getPackageStatus(pkg: ClientPackage): "success" | "warning" | "danger" {
  if (pkg.sessionsRemaining <= 0) return "danger";
  if (new Date(pkg.expiresAt) < new Date()) return "danger";
  return "success";
}

function getPackageStatusLabel(pkg: ClientPackage, t: (key: string) => string): string {
  if (new Date(pkg.expiresAt) < new Date()) return t("client.profileTab.expired");
  if (pkg.sessionsRemaining <= 0) return t("client.profileTab.expired");
  return t("client.package.active");
}

export default function ClientProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = getDateLocale();
  const [refreshing, setRefreshing] = useState(false);

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());

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
  const notes = notesQuery.data?.notes ?? [];
  const userEmail = meQuery.data?.user.email ?? "";

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
      queryClient.invalidateQueries({ queryKey: ["packages"] }),
      queryClient.invalidateQueries({ queryKey: ["trainerNotes"] }),
    ]);
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
        {/* Header: Avatar + Name + Email */}
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

        {/* My Packages */}
        <View className="flex-col gap-4">
          <SectionLabel>{t("client.profileTab.myPackages")}</SectionLabel>
          {packagesQuery.isError ? (
            <ErrorState message={t("client.package.error")} />
          ) : null}
          {packages.length === 0 && !packagesQuery.isLoading ? (
            <EmptyState title={t("client.package.noActive")} />
          ) : null}
          {packages.map((pkg: ClientPackage) => (
            <GlassCard key={pkg.id}>
              <View className="flex-col gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="font-semibold text-foreground" style={{ fontSize: 17 }}>
                    {pkg.packageType?.name ?? t("client.package.packageName")}
                  </Text>
                  <Badge status={getPackageStatus(pkg)}>
                    {getPackageStatusLabel(pkg, t)}
                  </Badge>
                </View>
                <Text className="text-[13px] text-muted">
                  {t("client.profileTab.sessions", {
                    remaining: pkg.sessionsRemaining,
                    total: pkg.packageType?.sessionCount ?? "?",
                  })}
                </Text>
                <Text className="text-[13px] text-muted">
                  {t("client.profileTab.expires", {
                    date: new Date(pkg.expiresAt).toLocaleDateString(dateLocale),
                  })}
                </Text>
              </View>
            </GlassCard>
          ))}
        </View>

        {/* Training History */}
        <View className="flex-col gap-4">
          <SectionLabel>{t("client.profileTab.trainingHistory")}</SectionLabel>
          {notesQuery.isError ? (
            <ErrorState message={t("client.history.error")} />
          ) : null}
          {notes.length === 0 && !notesQuery.isLoading ? (
            <EmptyState title={t("client.history.noNotes")} />
          ) : (
            <GlassCard>
              <View className="flex-col gap-3">
                {notes.slice(0, 20).map((note: TrainerNote) => (
                  <ListRow
                    key={note.id}
                    title={note.note}
                    subtitle={`${new Date(note.createdAt).toLocaleDateString(dateLocale)}${note.trainer ? ` · ${note.trainer.fullName}` : ""}`}
                  />
                ))}
              </View>
            </GlassCard>
          )}
        </View>

        {/* Preferences */}
        <View className="flex-col gap-4">
          <SectionLabel>{t("client.profileTab.preferences")}</SectionLabel>
          <GlassCard>
            <View className="flex-col gap-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] text-foreground">
                  {t("client.profileTab.language")}
                </Text>
              </View>
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
