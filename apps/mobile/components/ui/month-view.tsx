/**
 * MonthView — 7×6 calendar grid for a single month.
 *
 * Studio look: matches StudioWeekStrip's pill language (square 4pt corners,
 * caps DOW, ink-fill on selected, green border on today, accent dot under
 * days with activity). Out-of-month cells fade to faint.
 *
 * The header carries the localized "Maj 2026" label centered between
 * Feather prev/next chevrons.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import { Icon } from "@/components/ui/icon";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "./tokens";
import { CapsLabel } from "./studio";
import { startOfLocaleWeek } from "@/lib/use-week-navigation";

type ActivityValue = boolean | number | string;

type Props = {
  month: dayjs.Dayjs;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  activity?: Record<string, ActivityValue>;
  /**
   * YYYY-MM-DD → true when the viewing client has a booking that day.
   * Separate from `activity` ("the studio runs classes that day") because a
   * day is commonly both. Staff callers omit it and keep the plain dot.
   */
  bookedDates?: Record<string, boolean>;
};

export function MonthView({
  month,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  activity = {},
  bookedDates,
}: Props) {
  const tokens = useThemeTokens();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const localizedMonth = month.locale(lang);
  const todayKey = dayjs().format("YYYY-MM-DD");
  const currentMonthIndex = localizedMonth.month();

  const gridStart = startOfLocaleWeek(localizedMonth.startOf("month"));

  const weekdayLabels: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekdayLabels.push(gridStart.add(i, "day").format("dd"));
  }

  const cells: dayjs.Dayjs[] = [];
  for (let i = 0; i < 42; i++) cells.push(gridStart.add(i, "day"));

  return (
    <View className="flex-col gap-3">
      {/* Header — chevrons + centered caps month label */}
      <View className="flex-row justify-between items-center">
        <Pressable
          onPress={onPrevMonth}
          hitSlop={12}
          android_ripple={null}
          className="active:opacity-60 w-9 h-9 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Icon name="chevron-left" size={20} color={tokens.foreground} />
        </Pressable>
        <CapsLabel size={11} tracking={1.6}>
          {localizedMonth.format("MMMM YYYY")}
        </CapsLabel>
        <Pressable
          onPress={onNextMonth}
          hitSlop={12}
          android_ripple={null}
          className="active:opacity-60 w-9 h-9 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Icon name="chevron-right" size={20} color={tokens.foreground} />
        </Pressable>
      </View>

      {/* Weekday header — caps tracked, faint ink */}
      <View className="flex-row" style={{ gap: 4 }}>
        {weekdayLabels.map((label, idx) => (
          <View key={idx} className="flex-1 items-center">
            <Text
              className="text-faint"
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      <View className="flex-col" style={{ gap: 4 }}>
        {Array.from({ length: 6 }).map((_, row) => (
          <View key={row} className="flex-row" style={{ gap: 4 }}>
            {cells.slice(row * 7, row * 7 + 7).map((d) => {
              const dateKey = d.format("YYYY-MM-DD");
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === todayKey;
              const inMonth = d.month() === currentMonthIndex;
              const hasActivity = !!activity[dateKey];
              const isBooked = !!bookedDates?.[dateKey];

              const containerCls = isSelected
                ? "bg-foreground"
                : isToday
                  ? "border border-accent active:opacity-70"
                  : "border border-glass-border active:opacity-70";

              const numeralCls = isSelected
                ? "text-background"
                : isToday
                  ? "text-accent"
                  : inMonth
                    ? "text-foreground"
                    : "text-faint";

              return (
                <Pressable
                  key={dateKey}
                  testID={`month-day-${dateKey}`}
                  onPress={() => onSelectDate(dateKey)}
                  android_ripple={null}
                  className={`flex-1 items-center justify-center rounded ${containerCls}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  aria-pressed={isSelected}
                  accessibilityLabel={
                    isBooked
                      ? `${d.format("dddd, D MMMM YYYY")} — ${t("client.calendar.a11yBookedDay")}`
                      : d.format("dddd, D MMMM YYYY")
                  }
                  style={{ aspectRatio: 1 }}
                >
                  <Text
                    className={numeralCls}
                    style={{
                      fontFamily: "AlbertSans-SemiBold",
                      fontSize: 15,
                      letterSpacing: -0.2,
                    }}
                  >
                    {d.format("D")}
                  </Text>
                  {/*
                    Same two-indicator language as StudioWeekStrip: a booked
                    day is a larger hollow RING, a day that only has sessions
                    stays a small solid dot. Shape + size carry the meaning so
                    it survives colour-blindness and low vision.
                  */}
                  {isBooked ? (
                    <View
                      testID="month-booked-marker"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginTop: 2,
                        borderWidth: 2,
                        borderColor: isSelected ? tokens.background : tokens.accent,
                        backgroundColor: "transparent",
                      }}
                    />
                  ) : hasActivity ? (
                    <View
                      testID="month-sessions-dot"
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        marginTop: 4,
                        backgroundColor: isSelected ? tokens.background : tokens.accent,
                      }}
                    />
                  ) : (
                    <View style={{ width: 4, height: 4, marginTop: 4 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
