import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Text, XStack, YStack } from "tamagui";
import { GlassCard } from "@/components/ui/glass-card";

import { ProgressRing } from "@/components/ui/progress-ring";
import { WeekStrip } from "@/components/ui/week-strip";
import { EmptyState } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { OnboardingChecklist } from "@/components/client/onboarding-checklist";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { useQueryClient } from "@tanstack/react-query";

dayjs.extend(relativeTime);

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ClientHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = getDateLocale();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());
  const month = currentMonthKey();
  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const notificationsQuery = useQuery(notificationsQueries.list());

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) => p.sessionsRemaining > 0 && new Date(p.expiresAt) > new Date(),
  );
  const notes = notesQuery.data?.notes ?? [];
  const sessions = availabilityQuery.data?.sessions ?? [];
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const userName = meQuery.data?.user.email?.split("@")[0] ?? "";
  const userId = meQuery.data?.user.id ?? "";

  // Find next upcoming session
  const now = new Date();
  const upcomingSessions = sessions
    .filter((s) => new Date(s.startsAt) > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const nextSession = upcomingSessions[0] ?? null;

  // Build activity map for WeekStrip
  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    if (s.availableSlots > 0) {
      activityByDate[dateKey] = activityByDate[dateKey] === "booked" ? "booked" : "available";
    }
  }

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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <ScreenContainer>
        {/* Greeting row */}
        <XStack justify="space-between" items="center">
          <YStack>
            <Text fontSize="$7" fontWeight="700" color="$color" letterSpacing={-0.5}>
              {t("client.home.greeting", { name: userName })}
            </Text>
            <Text fontSize="$2" color="$color9">
              {dayjs().format("dddd, D MMMM")}
            </Text>
          </YStack>
          <YStack position="relative">
            <FontAwesome
              name="bell-o"
              size={22}
              color="#a1a1aa"
              onPress={() => router.push("/(client)/notifications")}
            />
            {unreadCount > 0 ? (
              <YStack
                position="absolute"
                top={-4}
                right={-6}
                bg="$accent1"
                borderRadius={8}
                minWidth={16}
                height={16}
                items="center"
                justify="center"
                px="$1"
              >
                <Text fontSize={10} fontWeight="700" color="$background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </YStack>
            ) : null}
          </YStack>
        </XStack>

        {/* Next class card */}
        {nextSession ? (
          <GlassCard accentBorder="left">
            <YStack gap="$2">
              <SectionLabel>{t("client.home.nextClass")}</SectionLabel>
              <Text fontSize="$5" fontWeight="700" color="$color">
                {nextSession.classTypeName}
              </Text>
              <XStack gap="$3" items="center">
                <Text fontSize="$2" color="$color9">
                  {dayjs(nextSession.startsAt).format("HH:mm")}
                </Text>
                <Text fontSize="$2" color="$accent1">
                  {t("client.home.in", { time: dayjs(nextSession.startsAt).fromNow(true) })}
                </Text>
                {nextSession.roomName ? (
                  <Text fontSize="$2" color="$color9">
                    {nextSession.roomName}
                  </Text>
                ) : null}
              </XStack>
            </YStack>
          </GlassCard>
        ) : (
          <EmptyState title={t("client.home.noUpcoming")} />
        )}

        {/* Weekly activity strip */}
        <WeekStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          activityByDate={activityByDate}
        />

        {/* Package summary card */}
        {activePackage ? (
          <GlassCard>
            <XStack gap="$4" items="center">
              <ProgressRing
                progress={
                  activePackage.packageType
                    ? (activePackage.packageType.sessionCount - activePackage.sessionsRemaining) /
                      activePackage.packageType.sessionCount
                    : 0
                }
                size={64}
                strokeWidth={6}
                label={String(activePackage.sessionsRemaining)}
                sublabel="left"
              />
              <YStack flex={1} gap="$1">
                <Text fontWeight="600" fontSize="$4" color="$color">
                  {activePackage.packageType?.name ?? t("client.package.packageName")}
                </Text>
                <Text fontSize="$2" color="$color9">
                  {t("client.home.sessionsLeft", {
                    used: activePackage.packageType
                      ? activePackage.packageType.sessionCount - activePackage.sessionsRemaining
                      : 0,
                    total: activePackage.packageType?.sessionCount ?? "?",
                  })}
                </Text>
                <Text fontSize="$1" color="$color9">
                  {new Date(activePackage.expiresAt).toLocaleDateString(dateLocale)}
                </Text>
              </YStack>
            </XStack>
          </GlassCard>
        ) : null}

        {/* Onboarding checklist */}
        {userId ? (
          <OnboardingChecklist
            userId={userId}
            userName={userName}
            bookingCount={upcomingSessions.length}
            onNavigate={(target) => router.push(`/(client)/${target}`)}
          />
        ) : null}

        {/* Recent trainer notes */}
        {notes.length > 0 ? (
          <YStack gap="$3">
            <SectionLabel>{t("client.home.recentNotes")}</SectionLabel>
            {notes.slice(0, 3).map((note: TrainerNote) => (
              <GlassCard key={note.id} size="sm">
                <YStack gap="$1">
                  <Text fontSize="$3" fontWeight="500" color="$color" numberOfLines={2}>
                    {note.note}
                  </Text>
                  <XStack gap="$2" items="center">
                    <Text fontSize="$1" color="$color9">
                      {new Date(note.createdAt).toLocaleDateString(dateLocale)}
                    </Text>
                    {note.trainer ? (
                      <>
                        <Text fontSize="$1" color="$color9">·</Text>
                        <Text fontSize="$1" color="$accent1">
                          {note.trainer.fullName}
                        </Text>
                      </>
                    ) : null}
                  </XStack>
                </YStack>
              </GlassCard>
            ))}
          </YStack>
        ) : null}
      </ScreenContainer>
    </ScrollView>
  );
}
