/**
 * Design references (from docs/inspiration/):
 * - Apple Fitness ios Feb 2026/ — ring as primary summary, card hierarchy
 * - Strava ios Feb 2025/ — activity feed card with hero + meta rows
 * - WHOOP ios Apr 2024/ — dense today-at-a-glance summary
 *
 * Structure: greeting → HeroCard (next class) → WeekStrip → package summary
 * → onboarding checklist → recent notes. Motion stagger (80ms per section).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroCard } from "@/components/ui/hero-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { EmptyState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { SkeletonCard, SkeletonList } from "@/components/ui/skeleton";
import { OnboardingChecklist } from "@/components/client/onboarding-checklist";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import {
  trainerNotesQueries,
  type TrainerNote,
} from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { useQueryClient } from "@tanstack/react-query";

dayjs.extend(relativeTime);

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Stagger({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 380, delay }}
    >
      {children}
    </MotiView>
  );
}

export default function ClientHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = getDateLocale();
  const [refreshing, setRefreshing] = useState(false);

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());
  const month = currentMonthKey();
  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) =>
      p.sessionsRemaining > 0 && new Date(p.expiresAt) > new Date(),
  );
  const notes = notesQuery.data?.notes ?? [];
  const sessions = availabilityQuery.data?.sessions ?? [];

  const userName = meQuery.data?.user.email?.split("@")[0] ?? "";
  const userId = meQuery.data?.user.id ?? "";

  const now = new Date();
  const upcomingSessions = sessions
    .filter((s) => new Date(s.startsAt) > now)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const nextSession = upcomingSessions[0] ?? null;

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
      queryClient.invalidateQueries({ queryKey: ["packages"] }),
      queryClient.invalidateQueries({ queryKey: ["trainerNotes"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
    setRefreshing(false);
  }

  const packageUsed =
    activePackage && activePackage.packageType
      ? activePackage.packageType.sessionCount -
        activePackage.sessionsRemaining
      : 0;
  const packageTotal = activePackage?.packageType?.sessionCount ?? 0;

  const isLoading =
    meQuery.isPending ||
    packagesQuery.isPending ||
    availabilityQuery.isPending;

  if (isLoading) {
    return (
      <ScreenContainer title={t("tabs.overview")}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <SkeletonCard />
          <SkeletonList count={3} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("tabs.overview")}>
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
        contentContainerStyle={{ gap: 24 }}
      >
        <Stagger delay={0}>
          <View className="flex-col">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 30, letterSpacing: -0.5 }}
            >
              {t("client.home.greeting", { name: userName })}
            </Text>
            <Text className="text-[13px] text-muted">
              {dayjs().locale(lang).format("dddd, D MMMM")}
            </Text>
          </View>
        </Stagger>

        <Stagger delay={80}>
          {nextSession ? (
            <HeroCard tone="accent">
              <View className="gap-2">
                <SectionLabel>{t("client.home.nextClass")}</SectionLabel>
                <Text
                  className="text-foreground font-body-bold"
                  style={{ fontSize: 28, letterSpacing: -0.5 }}
                >
                  {nextSession.classTypeName}
                </Text>
                <Text className="text-muted text-sm">
                  {dayjs(nextSession.startsAt).locale(lang).format("dddd · HH:mm")}
                  {nextSession.roomName ? ` · ${nextSession.roomName}` : ""}
                </Text>
                <View className="flex-row items-center gap-2 pt-1">
                  <View className="bg-accent-soft px-3 py-1 rounded-full">
                    <Text className="text-accent font-body-semibold text-xs">
                      {t("client.home.in", {
                        time: dayjs(nextSession.startsAt).locale(lang).fromNow(true),
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </HeroCard>
          ) : (
            <GlassCard>
              <EmptyState
                title={t("client.home.noUpcoming")}
              />
            </GlassCard>
          )}
        </Stagger>

        {activePackage ? (
          <Stagger delay={240}>
            <GlassCard>
              <View className="flex-row gap-4 items-center">
                <ProgressRing
                  progress={packageTotal ? packageUsed / packageTotal : 0}
                  size={72}
                  strokeWidth={7}
                  label={String(activePackage.sessionsRemaining)}
                  sublabel="left"
                />
                <View className="flex-1 flex-col gap-1">
                  <Text
                    className="font-body-semibold text-foreground"
                    style={{ fontSize: 17 }}
                  >
                    {activePackage.packageType?.name ??
                      t("client.package.packageName")}
                  </Text>
                  <Text className="text-[13px] text-muted">
                    {t("client.home.sessionsLeft", {
                      used: packageUsed,
                      total: activePackage.packageType?.sessionCount ?? "?",
                    })}
                  </Text>
                  <Text className="text-[11px] text-muted">
                    {new Date(activePackage.expiresAt).toLocaleDateString(
                      dateLocale,
                    )}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </Stagger>
        ) : null}

        {userId ? (
          <Stagger delay={320}>
            <OnboardingChecklist
              userId={userId}
              userName={userName}
              bookingCount={upcomingSessions.length}
              onNavigate={(target) => router.push(`/(client)/${target}`)}
            />
          </Stagger>
        ) : null}

        {notes.length > 0 ? (
          <Stagger delay={400}>
            <View className="flex-col gap-3">
              <SectionLabel>{t("client.home.recentNotes")}</SectionLabel>
              {notes.slice(0, 3).map((note: TrainerNote) => (
                <GlassCard key={note.id} size="sm">
                  <View className="flex-col gap-1">
                    <Text
                      className="text-[15px] font-body-medium text-foreground"
                      numberOfLines={2}
                    >
                      {note.note}
                    </Text>
                    <View className="flex-row gap-2 items-center">
                      <Text className="text-[11px] text-muted">
                        {new Date(note.createdAt).toLocaleDateString(
                          dateLocale,
                        )}
                      </Text>
                      {note.trainer ? (
                        <>
                          <Text className="text-[11px] text-muted">·</Text>
                          <Text className="text-[11px] text-accent">
                            {note.trainer.fullName}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          </Stagger>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
