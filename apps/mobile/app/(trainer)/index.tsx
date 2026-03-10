import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text, XStack, YStack } from "tamagui";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card, StatCard } from "@/components/ui/card";
import { SessionCard } from "@/components/ui/session-card";
import { WeekStrip } from "@/components/ui/week-strip";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionHeader, SectionLabel } from "@/components/ui/typography";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function TrainerSchedule() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [selectedSession, setSelectedSession] = useState<{
    sessionId: string;
    classTypeName: string;
    roomName: string | null;
    bookedCount: number;
    capacity: number;
    availableSlots: number;
    startsAt: Date;
    endsAt: Date;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const displayDate = dayjs(selectedDate);

  const meQuery = useQuery(authQueries.me());
  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const notifsQuery = useQuery(notificationsQueries.list());

  const sessions = availabilityQuery.data?.sessions ?? [];
  const sessionNotifs = (notifsQuery.data?.notifications ?? []).filter(
    (n: Notification) => n.type === "SESSION_UPDATED",
  );

  // Filter sessions for selected day
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // Build activity map for WeekStrip
  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = "available";
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
  }

  function navigateMonth(direction: -1 | 1) {
    const newDate = displayDate.add(direction, "month").startOf("month");
    setSelectedDate(newDate.format("YYYY-MM-DD"));
    setMonth(monthKeyFromDate(newDate));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
    ]);
    setRefreshing(false);
  }

  return (
    <ScreenContainerRaw>
      <YStack px="$5" gap="$4">
        <SectionHeader
          title={t("trainer.schedule.title")}
          subtitle={meQuery.data ? meQuery.data.user.email : undefined}
        />

        <Card>
          <StatCard label={t("trainer.schedule.sessionsThisMonth")} value={sessions.length} />
        </Card>

        {sessionNotifs.length > 0 ? (
          <Card>
            <YStack gap="$2">
              <Text fontWeight="600" fontSize="$3" color="$color">
                {t("trainer.schedule.sessionChanges")}
              </Text>
              {sessionNotifs.slice(0, 5).map((n: Notification) => (
                <Text key={n.id} fontSize="$2" color="$color10">
                  {n.title}: {n.body}
                </Text>
              ))}
            </YStack>
          </Card>
        ) : null}
      </YStack>

      {/* Month/year header with arrows */}
      <XStack px="$5" py="$3" justify="space-between" items="center">
        <FontAwesome
          name="chevron-left"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(-1)}
        />
        <Text fontSize="$5" fontWeight="700" color="$color" letterSpacing={-0.3}>
          {displayDate.format("MMMM YYYY")}
        </Text>
        <FontAwesome
          name="chevron-right"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(1)}
        />
      </XStack>

      {/* WeekStrip */}
      <YStack px="$5" pb="$3">
        <WeekStrip
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          activityByDate={activityByDate}
        />
      </YStack>

      {availabilityQuery.isError ? (
        <YStack px="$5">
          <ErrorState message={t("trainer.schedule.error")} />
        </YStack>
      ) : null}

      {/* Day sessions list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <SectionLabel>
          {displayDate.format("dddd, D MMMM")}
        </SectionLabel>
        <YStack gap="$3" pt="$3">
          {daySessions.length === 0 ? (
            <EmptyState title={t("client.dayView.noSessions")} />
          ) : (
            daySessions.map((session) => (
              <SessionCard
                key={session.id}
                time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
                className={session.classTypeName}
                room={session.roomName ?? undefined}
                bookedCount={session.bookedCount}
                capacity={session.capacity}
                status={session.availableSlots > 0 ? "available" : "full"}
                onPress={() =>
                  setSelectedSession({
                    sessionId: session.id,
                    classTypeName: session.classTypeName,
                    roomName: session.roomName,
                    bookedCount: session.bookedCount,
                    capacity: session.capacity,
                    availableSlots: session.availableSlots,
                    startsAt: session.startsAt,
                    endsAt: session.endsAt,
                  })
                }
              />
            ))
          )}
        </YStack>
      </ScrollView>

      <AppSheet open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        {selectedSession ? (
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {selectedSession.classTypeName}
            </Text>
            <Card>
              <YStack gap="$3">
                <ListRow
                  title={`${dayjs(selectedSession.startsAt).format("DD.MM.YYYY HH:mm")} - ${dayjs(selectedSession.endsAt).format("HH:mm")}`}
                  subtitle={`${t("trainer.schedule.room")}: ${selectedSession.roomName ?? "—"} · ${t("trainer.schedule.available")}: ${selectedSession.availableSlots}`}
                />
                <Badge variant="soft">
                  {selectedSession.bookedCount}/{selectedSession.capacity} {t("trainer.schedule.booked")}
                </Badge>
              </YStack>
            </Card>
          </YStack>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
