import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, type ICalendarEventBase } from "react-native-big-calendar";
import dayjs from "dayjs";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, YStack, useTheme } from "tamagui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useColorScheme } from "@/components/useColorScheme";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card, StatCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListRow, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SegmentedControl } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { notificationsQueries, type Notification } from "@/lib/queries/notifications-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";

type ViewMode = "day" | "week" | "month";

interface SessionEvent extends ICalendarEventBase {
  sessionId: string;
  classTypeName: string;
  roomName: string | null;
  bookedCount: number;
  capacity: number;
  availableSlots: number;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function TrainerSchedule() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SessionEvent | null>(null);
  const locale = getDateLocale().startsWith("en") ? "en" : "sr";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = useTheme();

  const meQuery = useQuery(authQueries.me());
  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const notifsQuery = useQuery(notificationsQueries.list());

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: async () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });

  const sessions = availabilityQuery.data?.sessions ?? [];
  const sessionNotifs = (notifsQuery.data?.notifications ?? []).filter((n: Notification) => n.type === "SESSION_UPDATED");

  const events: SessionEvent[] = sessions.map((s) => ({
    sessionId: s.id,
    title: `${s.classTypeName} (${s.bookedCount}/${s.capacity})`,
    start: new Date(s.startsAt),
    end: new Date(s.endsAt),
    classTypeName: s.classTypeName,
    roomName: s.roomName,
    bookedCount: s.bookedCount,
    capacity: s.capacity,
    availableSlots: s.availableSlots,
  }));

  function handleDateChange(date: Date) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key !== month) setMonth(key);
    setCalendarDate(date);
  }

  return (
    <ScreenContainerRaw>
      <YStack px="$5" gap="$3">
        <SectionHeader
          title={t("trainer.schedule.title")}
          subtitle={meQuery.data ? meQuery.data.user.email : undefined}
        />

        <Card>
          <YStack gap="$3">
            <SegmentedControl
              segments={[
                { value: "day" as const, label: t("trainer.schedule.viewDay") },
                { value: "week" as const, label: t("trainer.schedule.viewWeek") },
                { value: "month" as const, label: t("trainer.schedule.viewMonth") },
              ]}
              value={viewMode}
              onValueChange={setViewMode}
            />

            <StatCard label={t("trainer.schedule.sessionsThisMonth")} value={sessions.length} />
          </YStack>
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

      {availabilityQuery.isError ? (
        <YStack px="$5">
          <ErrorState message={t("trainer.schedule.error")} />
        </YStack>
      ) : null}

      <YStack flex={1} minHeight={500} px="$5">
        <Card>
          <Calendar
            events={events}
            height={480}
            mode={viewMode === "day" ? "day" : viewMode === "week" ? "week" : "month"}
            theme={{
              palette: {
                primary: {
                  main: "#2e5b42",
                  contrastText: "#ffffff",
                },
                nowIndicator: "#2e5b42",
                gray: {
                  100: isDark ? "#111827" : "#f3f4f6",
                  200: isDark ? "#1f2937" : "#e5e7eb",
                  300: isDark ? "#374151" : "#d1d5db",
                  500: isDark ? "#9ca3af" : "#6b7280",
                  800: isDark ? "#e5e7eb" : "#111827",
                },
                moreLabel: isDark ? "#e5e7eb" : "#374151",
              },
              typography: {
                sm: { fontWeight: "500", fontSize: 12 },
                xl: { fontWeight: "600", fontSize: 13 },
                moreLabel: { fontWeight: "600", fontSize: 11 },
              },
            }}
            calendarContainerStyle={{
              borderRadius: 12,
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
            }}
            bodyContainerStyle={{
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
            }}
            headerContainerStyle={{
              borderBottomColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(15,23,42,0.08)",
              borderBottomWidth: 1,
            }}
            eventCellStyle={{
              backgroundColor: "#2e5b42",
              borderRadius: 10,
              borderWidth: 0,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
            eventCellTextColor="#ffffff"
            calendarCellStyle={{
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
              borderColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(15,23,42,0.08)",
              borderWidth: 1,
            }}
            calendarCellTextStyle={{
              color: theme.color.val,
            }}
            date={calendarDate}
            onPressEvent={(event) => setSelectedEvent(event as SessionEvent)}
            onSwipeEnd={handleDateChange}
            swipeEnabled
            weekStartsOn={1}
            locale={locale}
          />
        </Card>
      </YStack>

      <YStack px="$5" pb="$4" gap="$3">
        <Card>
          <LanguageSwitcher />
        </Card>
        <Button variant="secondary" onPress={() => signOutMutation.mutate()}>
          {t("client.signOut")}
        </Button>
      </YStack>

      <AppSheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        {selectedEvent ? (
          <YStack gap="$4">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {selectedEvent.classTypeName}
            </Text>
            <Card>
              <YStack gap="$3">
                <ListRow
                  title={`${dayjs(selectedEvent.start).format("DD.MM.YYYY HH:mm")} - ${dayjs(selectedEvent.end).format("HH:mm")}`}
                  subtitle={`${t("trainer.schedule.room")}: ${selectedEvent.roomName ?? "—"} · ${t("trainer.schedule.available")}: ${selectedEvent.availableSlots}`}
                />
                <Badge variant="soft">
                  {selectedEvent.bookedCount}/{selectedEvent.capacity} {t("trainer.schedule.booked")}
                </Badge>
              </YStack>
            </Card>
          </YStack>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
