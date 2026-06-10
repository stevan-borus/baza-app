/**
 * Client Calendar tab — Day / Month views over the booking schedule.
 *
 * - Day view: StudioWeekStrip + a ScheduleRow card list; tap a session to
 *   book/cancel via the booking sheet. (Staff get the timeline view instead.)
 * - Month view: MonthView grid with accent dots on days that have any
 *   bookable sessions; tap a date to switch to Day mode focused on it.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MotiView } from "@/components/ui/styled";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { StudioWeekStrip, CapsLabel } from "@/components/ui/studio";
import { MonthView } from "@/components/ui/month-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ScheduleRow } from "@/components/ui/schedule-row";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  useBookingSheet,
  ClientBookingSheet,
} from "@/components/client/use-booking-sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { SkeletonList } from "@/components/ui/skeleton";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { useWeekNavigation, weekRangeLabel } from "@/lib/use-week-navigation";
import type { AvailabilitySession } from "@baza/types";

type ViewTab = "day" | "month";

export default function ClientCalendar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  // Optional ?date=YYYY-MM-DD deep-link from the overview: tapping a session
  // there should open the calendar focused on THAT session's day, not today.
  const params = useLocalSearchParams<{ date?: string }>();
  const isValidDate = (d?: string) =>
    !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && dayjs(d).isValid();
  const initialDay = isValidDate(params.date)
    ? dayjs(params.date)
    : dayjs();

  const nav = useWeekNavigation(initialDay);
  const { selectedDate, weekStart, month, monthDate } = nav;
  const [viewTab, setViewTab] = useState<ViewTab>("day");

  // Re-focus when the deep-link param changes between visits (the screen stays
  // mounted as a tab, so initial state alone won't update on the next tap).
  const lastDateParam = useRef(params.date);
  useEffect(() => {
    if (params.date === lastDateParam.current) return;
    lastDateParam.current = params.date;
    if (!isValidDate(params.date)) return;
    nav.jumpToDate(dayjs(params.date));
    setViewTab("day");
  }, [params.date, nav]);
  const booking = useBookingSheet();

  const displayDate = dayjs(selectedDate);

  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );

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
    nav.selectDay(d);
  }

  // Tap on a day cell in month view: switch back to day mode focused on
  // that date and re-anchor the week strip so the date is in view.
  function handleMonthCellSelect(date: string) {
    Haptics.selectionAsync();
    nav.selectMonthCell(date);
    setViewTab("day");
  }

  function handleSessionPress(s: AvailabilitySession) {
    booking.open(s);
  }

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
              onPrevWeek={nav.goToPreviousWeek}
              onNextWeek={nav.goToNextWeek}
              rangeLabel={weekRangeLabel(weekStart, lang)}
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
              onPrevMonth={nav.goToPreviousMonth}
              onNextMonth={nav.goToNextMonth}
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

          <View className="px-5 pb-2">
            <CapsLabel size={12} tracking={2.4}>
              {displayDate.locale(lang).format("dddd, D MMMM").toUpperCase()}
            </CapsLabel>
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
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: bottomPad,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Rows sit in one rounded surface card — matches the overview
                  "this week" list so the calendar day view reads consistently
                  (a lone row floating on bare bone looked unanchored). */}
              <View
                style={{
                  backgroundColor: tokens.surface,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {daySessions.map((s, i) => (
                  <View key={s.id}>
                    <View style={{ marginHorizontal: -4 }}>
                      <ScheduleRow
                        session={s}
                        onPress={() => handleSessionPress(s)}
                      />
                    </View>
                    {i < daySessions.length - 1 ? (
                      <View
                        style={{
                          height: 1,
                          backgroundColor: tokens.glassBorder,
                          marginLeft: 20 + 64 + 14,
                          marginRight: 20,
                        }}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </>
      ) : null}

      <ClientBookingSheet controller={booking} sessions={sessions} />
    </ScreenContainerRaw>
  );
}
