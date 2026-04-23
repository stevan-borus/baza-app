import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionCard } from "@/components/ui/session-card";
import { WeekStrip } from "@/components/ui/week-strip";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionLabel } from "@/components/ui/typography";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import type { AvailabilitySession } from "@baza/types";

type BookingStep = "idle" | "confirmBook" | "confirmCancel";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function ClientCalendar() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [selectedSession, setSelectedSession] = useState<AvailabilitySession | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>("idle");

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));

  const bookingMutation = useMutation({
    ...bookingsQueries.mutateBooking(),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ["sessions", "availability", month] });
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      setSelectedSession(null);
      setBookingStep("idle");
    },
  });

  const sessions = availabilityQuery.data?.sessions ?? [];

  // Filter sessions for selected day
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // Build activity map for WeekStrip
  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] = s.availableSlots > 0 ? "available" : (activityByDate[dateKey] ?? "available");
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

  function handleSessionPress(session: AvailabilitySession) {
    setSelectedSession(session);
    setBookingStep("idle");
  }

  function getSessionStatus(s: AvailabilitySession): "available" | "full" | "booked" | "waitlisted" {
    if (s.availableSlots > 0) return "available";
    return "full";
  }

  const bookingResultState = bookingMutation.data?.state as string | undefined;

  return (
    <ScreenContainerRaw>
      {/* Month/year header with arrows */}
      <View className="flex-row justify-between items-center px-6 py-3">
        <FontAwesome
          name="chevron-left"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(-1)}
        />
        <Text
          className="text-foreground font-bold"
          style={{ fontSize: 20, letterSpacing: -0.3 }}
        >
          {displayDate.format("MMMM YYYY")}
        </Text>
        <FontAwesome
          name="chevron-right"
          size={16}
          color="#a1a1aa"
          onPress={() => navigateMonth(1)}
        />
      </View>

      {/* WeekStrip */}
      <View className="px-6 pb-3">
        <WeekStrip
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          activityByDate={activityByDate}
        />
      </View>

      {availabilityQuery.isError ? (
        <View className="px-6">
          <ErrorState message={t("client.calendar.errorSlots")} />
        </View>
      ) : null}

      {bookingMutation.isError ? (
        <View className="px-6 pb-3">
          <ErrorState message={t("client.calendar.bookingError")} />
        </View>
      ) : null}

      {bookingMutation.isSuccess && bookingResultState ? (
        <View className="px-6 pb-3">
          <GlassCard size="sm">
            <Text className="font-semibold text-accent">
              {bookingResultState === "BOOKED" ? t("client.calendar.bookingBooked") :
               bookingResultState === "WAITLISTED" ? t("client.calendar.bookingWaitlisted") :
               bookingResultState === "CANCELED" ? t("client.calendar.bookingCanceled") :
               bookingResultState}
            </Text>
          </GlassCard>
        </View>
      ) : null}

      {/* Day sessions list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        <SectionLabel>
          {displayDate.format("dddd, D MMMM")}
        </SectionLabel>
        <View className="flex-col gap-3 pt-3">
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
                status={getSessionStatus(session)}
                onPress={() => handleSessionPress(session)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Session detail sheet */}
      <AppSheet
        open={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
            setBookingStep("idle");
          }
        }}
      >
        {selectedSession ? (
          <View className="flex-col gap-5">
            <Text
              className="text-foreground font-bold"
              style={{ fontSize: 24, letterSpacing: -0.3 }}
            >
              {selectedSession.classTypeName}
            </Text>
            <GlassCard>
              <View className="flex-col gap-3">
                <ListRow
                  title={`${dayjs(selectedSession.startsAt).format("DD.MM.YYYY HH:mm")} - ${dayjs(selectedSession.endsAt).format("HH:mm")}`}
                  subtitle={`${t("client.calendar.room")}: ${selectedSession.roomName ?? "—"}`}
                />
                <ListRow
                  title={t("client.dayView.duration", {
                    minutes: dayjs(selectedSession.endsAt).diff(dayjs(selectedSession.startsAt), "minute"),
                  })}
                  subtitle={t("client.dayView.participants", {
                    count: selectedSession.bookedCount,
                    capacity: selectedSession.capacity,
                  })}
                />
                <View className="flex-row gap-2">
                  <Badge
                    status={selectedSession.availableSlots > 0 ? "success" : "danger"}
                  >
                    {selectedSession.availableSlots > 0
                      ? t("client.calendar.availableSlots", { count: selectedSession.availableSlots })
                      : t("client.calendar.full")}
                  </Badge>
                  {selectedSession.waitlistCount > 0 ? (
                    <Badge status="warning">
                      {t("client.calendar.waitlistShort", { count: selectedSession.waitlistCount })}
                    </Badge>
                  ) : null}
                </View>
              </View>
            </GlassCard>

            {/* Two-step booking */}
            {bookingStep === "idle" ? (
              <View className="flex-row gap-3">
                {selectedSession.availableSlots > 0 ? (
                  <Button
                    className="flex-1"
                    onPress={() => setBookingStep("confirmBook")}
                    disabled={bookingMutation.isPending}
                  >
                    {t("client.calendar.book")}
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => {
                      bookingMutation.mutate({ sessionId: selectedSession.id, action: "BOOK" });
                    }}
                    disabled={bookingMutation.isPending}
                  >
                    {t("client.dayView.joinWaitlist")}
                  </Button>
                )}
                <Button
                  className="flex-1"
                  variant="danger"
                  onPress={() => setBookingStep("confirmCancel")}
                  disabled={bookingMutation.isPending}
                >
                  {t("client.calendar.cancel")}
                </Button>
              </View>
            ) : bookingStep === "confirmBook" ? (
              <View className="flex-col gap-3">
                <Text
                  className="text-foreground font-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.confirmBook")}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    className="flex-1"
                    onPress={() => {
                      bookingMutation.mutate({ sessionId: selectedSession.id, action: "BOOK" });
                    }}
                    disabled={bookingMutation.isPending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => setBookingStep("idle")}
                  >
                    {t("client.calendar.cancel")}
                  </Button>
                </View>
              </View>
            ) : (
              <View className="flex-col gap-3">
                <Text
                  className="text-foreground font-semibold text-[15px]"
                  style={{ textAlign: "center" }}
                >
                  {t("client.dayView.cancelWarning")}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    className="flex-1"
                    variant="danger"
                    onPress={() => {
                      bookingMutation.mutate({ sessionId: selectedSession.id, action: "CANCEL" });
                    }}
                    disabled={bookingMutation.isPending}
                  >
                    {t("client.dayView.confirm")}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onPress={() => setBookingStep("idle")}
                  >
                    {t("client.calendar.cancel")}
                  </Button>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
