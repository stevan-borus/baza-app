/**
 * Client Calendar tab — Day / Month views over the booking schedule.
 *
 * - Day view: StudioWeekStrip + TimeAxisDayView; tap a session to book/cancel
 *   via the booking sheet.
 * - Month view: MonthView grid with accent dots on days that have any
 *   bookable sessions; tap a date to switch to Day mode focused on it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { GlassCard } from "@/components/ui/glass-card";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { StudioWeekStrip, CapsLabel } from "@/components/ui/studio";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  TimeAxisDayView,
  type SessionBlock,
} from "@/components/ui/time-axis-day-view";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { SkeletonList } from "@/components/ui/skeleton";
import { BookingSheet } from "@/components/client/booking-sheet";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import type { AvailabilitySession } from "@baza/types";

type ViewTab = "day" | "month";

function monthKeyFromDate(d: dayjs.Dayjs) {
  return d.format("YYYY-MM");
}

export default function ClientCalendar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding(24);
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [month, setMonth] = useState(() => monthKeyFromDate(dayjs()));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [monthDate, setMonthDate] = useState(() => dayjs().startOf("month"));
  const [viewTab, setViewTab] = useState<ViewTab>("day");
  const [selectedSession, setSelectedSession] =
    useState<AvailabilitySession | null>(null);

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
    },
  });

  const sessions = availabilityQuery.data?.sessions ?? [];
  const daySessions = sessions.filter(
    (s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate,
  );

  // YYYY-MM-DD → number of sessions on that day. Drives the dot indicator
  // under each day pill in StudioWeekStrip.
  const sessionsByDay = sessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  function handleDateSelect(d: dayjs.Dayjs) {
    Haptics.selectionAsync();
    // Picking a day must NOT shift the visible week. The week boundary is
    // owned by `weekStart` and only changes via the arrow buttons below.
    const date = d.format("YYYY-MM-DD");
    setSelectedDate(date);
    const newMonth = monthKeyFromDate(d);
    if (newMonth !== month) setMonth(newMonth);
  }

  function handlePrevWeek() {
    const newStart = weekStart.subtract(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }

  function handleNextWeek() {
    const newStart = weekStart.add(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }

  function handlePrevMonth() {
    const next = monthDate.subtract(1, "month");
    setMonthDate(next);
    setMonth(next.format("YYYY-MM"));
  }

  function handleNextMonth() {
    const next = monthDate.add(1, "month");
    setMonthDate(next);
    setMonth(next.format("YYYY-MM"));
  }

  // Tap on a day cell in month view: switch back to day mode focused on
  // that date and re-anchor the week strip so the date is in view.
  function handleMonthCellSelect(date: string) {
    Haptics.selectionAsync();
    setSelectedDate(date);
    setWeekStart(startOfLocaleWeek(dayjs(date)));
    const newMonth = monthKeyFromDate(dayjs(date));
    if (newMonth !== month) setMonth(newMonth);
    setViewTab("day");
  }

  function handleSessionPress(s: SessionBlock) {
    const full = sessions.find((x) => x.id === s.id);
    if (full) setSelectedSession(full);
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
    <ScreenContainerRaw title={t("tabs.calendar")}>
      {/* Day / Month view toggle */}
      <View className="px-5 pt-3 pb-3">
        <SegmentedControl<ViewTab>
          options={[
            { value: "day", label: t("admin.schedule.viewDay") },
            { value: "month", label: t("admin.schedule.viewMonth") },
          ]}
          value={viewTab}
          onChange={setViewTab}
        />
      </View>

      {viewTab === "day" ? (
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <View className="pb-3">
            <StudioWeekStrip
              weekStart={weekStart}
              selected={dayjs(selectedDate)}
              onSelect={handleDateSelect}
              sessionsByDay={sessionsByDay}
              onPrevWeek={handlePrevWeek}
              onNextWeek={handleNextWeek}
              rangeLabel={`${weekStart.locale(lang).format("D. MMM")} — ${weekStart
                .add(6, "day")
                .locale(lang)
                .format("D. MMM")}`}
            />
          </View>
        </MotiView>
      ) : (
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
          style={{ flex: 1 }}
        >
          <View className="px-5 pb-4" style={{ flex: 1 }}>
            <MonthView
              month={monthDate}
              selectedDate={selectedDate}
              onSelectDate={handleMonthCellSelect}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              activity={sessionsByDay}
            />
          </View>
        </MotiView>
      )}

      {viewTab === "day" ? (
        <>
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
                  <Text className="font-body-semibold text-accent">
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

          <View className="px-5 pb-2 flex-row items-baseline justify-between">
            <CapsLabel size={12} tracking={2.4}>
              {displayDate.locale(lang).format("dddd, D MMMM").toUpperCase()}
            </CapsLabel>
            <Text className="text-xs text-muted">
              {daySessions.length === 0
                ? ""
                : t("client.calendar.classCount", { count: daySessions.length })}
            </Text>
          </View>

          {availabilityQuery.isLoading ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 8,
                paddingBottom: bottomPad,
              }}
            >
              <SkeletonList count={3} />
            </ScrollView>
          ) : daySessions.length === 0 ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 8,
                paddingBottom: bottomPad,
              }}
            >
              <EmptyState title={t("client.dayView.noSessions")} />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <TimeAxisDayView
                date={selectedDate}
                sessions={timeAxisSessions}
                onSessionPress={handleSessionPress}
                showNowLine
              />
            </View>
          )}
        </>
      ) : null}

      <BookingSheet
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onBook={(id) =>
          bookingMutation.mutate({ sessionId: id, action: "BOOK" })
        }
        onCancel={(id) =>
          bookingMutation.mutate({ sessionId: id, action: "CANCEL" })
        }
        pending={bookingMutation.isPending}
      />
    </ScreenContainerRaw>
  );
}
