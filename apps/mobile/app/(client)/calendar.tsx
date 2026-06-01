/**
 * Client Calendar tab — Day / Month views over the booking schedule.
 *
 * - Day view: StudioWeekStrip + a ScheduleRow card list; tap a session to
 *   book/cancel via the booking sheet. (Staff get the timeline view instead.)
 * - Month view: MonthView grid with accent dots on days that have any
 *   bookable sessions; tap a date to switch to Day mode focused on it.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { StudioWeekStrip, CapsLabel } from "@/components/ui/studio";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ScheduleRow } from "@/components/ui/schedule-row";
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

  // Optional ?date=YYYY-MM-DD deep-link from the overview: tapping a session
  // there should open the calendar focused on THAT session's day, not today.
  const params = useLocalSearchParams<{ date?: string }>();
  const isValidDate = (d?: string) =>
    !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && dayjs(d).isValid();
  const initialDay = isValidDate(params.date)
    ? dayjs(params.date)
    : dayjs();

  const [selectedDate, setSelectedDate] = useState(
    initialDay.format("YYYY-MM-DD"),
  );
  const [month, setMonth] = useState(() => monthKeyFromDate(initialDay));
  const [weekStart, setWeekStart] = useState(() =>
    startOfLocaleWeek(initialDay),
  );
  const [monthDate, setMonthDate] = useState(() => initialDay.startOf("month"));
  const [viewTab, setViewTab] = useState<ViewTab>("day");

  // Re-focus when the deep-link param changes between visits (the screen stays
  // mounted as a tab, so initial state alone won't update on the next tap).
  const lastDateParam = useRef(params.date);
  useEffect(() => {
    if (params.date === lastDateParam.current) return;
    lastDateParam.current = params.date;
    if (!isValidDate(params.date)) return;
    const d = dayjs(params.date);
    setSelectedDate(d.format("YYYY-MM-DD"));
    setWeekStart(startOfLocaleWeek(d));
    setMonth(monthKeyFromDate(d));
    setMonthDate(d.startOf("month"));
    setViewTab("day");
  }, [params.date]);
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
      // Sheet stays open so the in-sheet success block can show.
      // It closes when the user taps Zatvori (BookingSheet's handleClose).
    },
  });

  const sessions = availabilityQuery.data?.sessions ?? [];

  // After mutation invalidation, sessions list re-fetches with updated
  // bookedCount / isBookedByMe. Re-hydrate the open sheet's session from the
  // fresh array so the post-success state reflects current data (1/6 etc.).
  const freshSelectedSession = selectedSession
    ? (sessions.find((s) => s.id === selectedSession.id) ?? selectedSession)
    : null;
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

  function handleSessionPress(s: AvailabilitySession) {
    setSelectedSession(s);
  }

  const bookingResultState = bookingMutation.data?.state as string | undefined;

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
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPad }}
              showsVerticalScrollIndicator={false}
            >
              {daySessions.map((s, i) => (
                <View key={s.id}>
                  <ScheduleRow
                    session={s}
                    onPress={() => handleSessionPress(s)}
                  />
                  {i < daySessions.length - 1 ? (
                    <View className="h-px bg-glass-border mx-5" />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : null}

      <BookingSheet
        session={freshSelectedSession}
        onClose={() => {
          setSelectedSession(null);
          // Clear stale success/error state so re-opening the sheet for
          // another session starts fresh (no leftover "booked!" confirmation).
          bookingMutation.reset();
        }}
        onBook={(id) =>
          bookingMutation.mutate({ sessionId: id, action: "BOOK" })
        }
        onCancel={(id) =>
          bookingMutation.mutate({ sessionId: id, action: "CANCEL" })
        }
        pending={bookingMutation.isPending}
        successState={
          bookingMutation.isSuccess
            ? (bookingResultState === "BOOKED" ||
              bookingResultState === "BOOKED_ALREADY"
                ? "BOOKED"
                : bookingResultState === "WAITLISTED"
                  ? "WAITLISTED"
                  : bookingResultState === "CANCELED"
                    ? "CANCELED"
                    : null)
            : null
        }
        errorCode={
          bookingMutation.isError
            ? ((bookingMutation.error as Error & { code?: string })?.code ??
                bookingMutation.error?.message ??
                "UNKNOWN")
            : null
        }
      />
    </ScreenContainerRaw>
  );
}
