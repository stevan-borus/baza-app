/**
 * Design references (from docs/inspiration/):
 * - Google Calendar ios May 2021/ — time-axis day view pattern (hour gutter + positioned blocks)
 * - Fresha ios Oct 2024/ — studio booking day view, capacity indicators
 *
 * Structure: month header + WeekStrip (day nav) + TimeAxisDayView (main surface).
 * Booking sheet is kept in place here until Task P2-T4 extracts it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { MotiView } from "moti";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useTranslation } from "react-i18next";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WeekStrip } from "@/components/ui/week-strip";
import {
  TimeAxisDayView,
  type SessionBlock,
} from "@/components/ui/time-axis-day-view";
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
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [selectedSession, setSelectedSession] =
    useState<AvailabilitySession | null>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>("idle");

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );

  const bookingMutation = useMutation({
    ...bookingsQueries.mutateBooking(),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "availability", month],
      });
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
      setSelectedSession(null);
      setBookingStep("idle");
    },
  });

  const sessions = availabilityQuery.data?.sessions ?? [];
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  const activityByDate: Record<string, "booked" | "available"> = {};
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    activityByDate[dateKey] =
      s.availableSlots > 0
        ? "available"
        : (activityByDate[dateKey] ?? "available");
  }

  function handleDateSelect(date: string) {
    Haptics.selectionAsync();
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
  }

  function navigateMonth(direction: -1 | 1) {
    const newDate = displayDate.add(direction, "month").startOf("month");
    setSelectedDate(newDate.format("YYYY-MM-DD"));
    setMonth(monthKeyFromDate(newDate));
  }

  function handleSessionPress(s: SessionBlock | AvailabilitySession) {
    const full = sessions.find((x) => x.id === s.id);
    if (full) {
      setSelectedSession(full);
      setBookingStep("idle");
    }
  }

  const bookingResultState = bookingMutation.data?.state as string | undefined;

  const timeAxisSessions: SessionBlock[] = daySessions.map((s) => ({
    id: s.id,
    startsAt:
      typeof s.startsAt === "string" ? s.startsAt : s.startsAt.toISOString(),
    endsAt: typeof s.endsAt === "string" ? s.endsAt : s.endsAt.toISOString(),
    classTypeName: s.classTypeName,
    roomName: s.roomName,
    bookedCount: s.bookedCount,
    capacity: s.capacity,
    status: s.availableSlots > 0 ? "available" : "full",
  }));

  return (
    <ScreenContainerRaw>
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350 }}
      >
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

        <View className="px-6 pb-3">
          <WeekStrip
            selectedDate={selectedDate}
            onSelectDate={handleDateSelect}
            activityByDate={activityByDate}
          />
        </View>
      </MotiView>

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
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 250 }}
        >
          <View className="px-6 pb-3">
            <GlassCard size="sm">
              <Text className="font-semibold text-accent">
                {bookingResultState === "BOOKED"
                  ? t("client.calendar.bookingBooked")
                  : bookingResultState === "WAITLISTED"
                    ? t("client.calendar.bookingWaitlisted")
                    : bookingResultState === "CANCELED"
                      ? t("client.calendar.bookingCanceled")
                      : bookingResultState}
              </Text>
            </GlassCard>
          </View>
        </MotiView>
      ) : null}

      <View className="px-6 pb-2 flex-row items-baseline justify-between">
        <SectionLabel>{displayDate.format("dddd, D MMMM")}</SectionLabel>
        <Text className="text-xs text-muted">
          {daySessions.length === 0
            ? ""
            : t("client.calendar.classCount", { count: daySessions.length })}
        </Text>
      </View>

      {daySessions.length === 0 ? (
        <View className="px-6 pt-2">
          <EmptyState title={t("client.dayView.noSessions")} />
        </View>
      ) : (
        <TimeAxisDayView
          date={selectedDate}
          sessions={timeAxisSessions}
          onSessionPress={handleSessionPress}
          showNowLine
        />
      )}

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
                    minutes: dayjs(selectedSession.endsAt).diff(
                      dayjs(selectedSession.startsAt),
                      "minute",
                    ),
                  })}
                  subtitle={t("client.dayView.participants", {
                    count: selectedSession.bookedCount,
                    capacity: selectedSession.capacity,
                  })}
                />
                <View className="flex-row gap-2">
                  <Badge
                    status={
                      selectedSession.availableSlots > 0 ? "success" : "danger"
                    }
                  >
                    {selectedSession.availableSlots > 0
                      ? t("client.calendar.availableSlots", {
                          count: selectedSession.availableSlots,
                        })
                      : t("client.calendar.full")}
                  </Badge>
                  {selectedSession.waitlistCount > 0 ? (
                    <Badge status="warning">
                      {t("client.calendar.waitlistShort", {
                        count: selectedSession.waitlistCount,
                      })}
                    </Badge>
                  ) : null}
                </View>
              </View>
            </GlassCard>

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
                      bookingMutation.mutate({
                        sessionId: selectedSession.id,
                        action: "BOOK",
                      });
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
                      bookingMutation.mutate({
                        sessionId: selectedSession.id,
                        action: "BOOK",
                      });
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
                      bookingMutation.mutate({
                        sessionId: selectedSession.id,
                        action: "CANCEL",
                      });
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
