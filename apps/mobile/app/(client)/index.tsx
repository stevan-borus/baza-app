import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
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
        <View className="flex-row justify-between items-center">
          <View className="flex-col">
            <Text
              className="text-foreground font-bold"
              style={{ fontSize: 30, letterSpacing: -0.5 }}
            >
              {t("client.home.greeting", { name: userName })}
            </Text>
            <Text className="text-[13px] text-muted">
              {dayjs().format("dddd, D MMMM")}
            </Text>
          </View>
          <View style={{ position: "relative" }}>
            <FontAwesome
              name="bell-o"
              size={22}
              color="#a1a1aa"
              onPress={() => router.push("/(client)/notifications")}
            />
            {unreadCount > 0 ? (
              <View
                className="bg-accent items-center justify-center"
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  borderRadius: 8,
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#0A0F14" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Next class card */}
        {nextSession ? (
          <GlassCard accentBorder="left">
            <View className="flex-col gap-2">
              <SectionLabel>{t("client.home.nextClass")}</SectionLabel>
              <Text
                className="text-foreground font-bold"
                style={{ fontSize: 20 }}
              >
                {nextSession.classTypeName}
              </Text>
              <View className="flex-row gap-3 items-center">
                <Text className="text-[13px] text-muted">
                  {dayjs(nextSession.startsAt).format("HH:mm")}
                </Text>
                <Text className="text-[13px] text-accent">
                  {t("client.home.in", { time: dayjs(nextSession.startsAt).fromNow(true) })}
                </Text>
                {nextSession.roomName ? (
                  <Text className="text-[13px] text-muted">
                    {nextSession.roomName}
                  </Text>
                ) : null}
              </View>
            </View>
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
            <View className="flex-row gap-4 items-center">
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
              <View className="flex-1 flex-col gap-1">
                <Text className="font-semibold text-foreground" style={{ fontSize: 17 }}>
                  {activePackage.packageType?.name ?? t("client.package.packageName")}
                </Text>
                <Text className="text-[13px] text-muted">
                  {t("client.home.sessionsLeft", {
                    used: activePackage.packageType
                      ? activePackage.packageType.sessionCount - activePackage.sessionsRemaining
                      : 0,
                    total: activePackage.packageType?.sessionCount ?? "?",
                  })}
                </Text>
                <Text className="text-[11px] text-muted">
                  {new Date(activePackage.expiresAt).toLocaleDateString(dateLocale)}
                </Text>
              </View>
            </View>
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
          <View className="flex-col gap-3">
            <SectionLabel>{t("client.home.recentNotes")}</SectionLabel>
            {notes.slice(0, 3).map((note: TrainerNote) => (
              <GlassCard key={note.id} size="sm">
                <View className="flex-col gap-1">
                  <Text className="text-[15px] font-medium text-foreground" numberOfLines={2}>
                    {note.note}
                  </Text>
                  <View className="flex-row gap-2 items-center">
                    <Text className="text-[11px] text-muted">
                      {new Date(note.createdAt).toLocaleDateString(dateLocale)}
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
        ) : null}
      </ScreenContainer>
    </ScrollView>
  );
}
