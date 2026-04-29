/**
 * MonthView — 7×6 calendar grid for a single month.
 *
 * Leading and trailing days from neighbouring months are rendered greyed
 * out so the grid is always a complete 6-row block. Each cell shows the
 * day number with an accent dot when `activity[date]` is truthy.
 *
 * The header row carries the localized month/year string and arrow
 * buttons for prev/next month navigation. Tapping a cell calls
 * `onSelectDate` only — switching back to a Day or Week view is the
 * parent's job.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useThemeTokens } from "./tokens";
import { startOfLocaleWeek } from "./week-strip";

type ActivityValue = boolean | number | string;

type Props = {
  month: dayjs.Dayjs;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  activity?: Record<string, ActivityValue>;
};

export function MonthView({
  month,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  activity = {},
}: Props) {
  const tokens = useThemeTokens();
  const todayKey = dayjs().format("YYYY-MM-DD");
  const currentMonthIndex = month.month();

  // Grid origin: start-of-week for the 1st of `month`.
  const gridStart = startOfLocaleWeek(month.startOf("month"));

  // Weekday header labels (using the same locale-aware origin).
  const weekdayLabels: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekdayLabels.push(gridStart.add(i, "day").format("dd"));
  }

  // 6 rows × 7 cols = 42 cells.
  const cells: dayjs.Dayjs[] = [];
  for (let i = 0; i < 42; i++) cells.push(gridStart.add(i, "day"));

  return (
    <View className="flex-col gap-3">
      {/* Header */}
      <View className="flex-row justify-between items-center">
        <Pressable
          onPress={onPrevMonth}
          hitSlop={12}
          className="active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <FontAwesome name="chevron-left" size={16} color={tokens.muted} />
        </Pressable>
        <Text
          className="font-body-bold text-foreground"
          style={{ fontSize: 18, letterSpacing: -0.3 }}
        >
          {month.format("MMMM YYYY")}
        </Text>
        <Pressable
          onPress={onNextMonth}
          hitSlop={12}
          className="active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <FontAwesome name="chevron-right" size={16} color={tokens.muted} />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View className="flex-row">
        {weekdayLabels.map((label, idx) => (
          <View key={idx} className="flex-1" style={{ alignItems: "center" }}>
            <Text
              className="text-muted"
              style={{
                fontSize: 10,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid (6 rows of 7) */}
      <View className="flex-col" style={{ gap: 4 }}>
        {Array.from({ length: 6 }).map((_, row) => (
          <View key={row} className="flex-row" style={{ gap: 4 }}>
            {cells.slice(row * 7, row * 7 + 7).map((d) => {
              const dateKey = d.format("YYYY-MM-DD");
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === todayKey;
              const inMonth = d.month() === currentMonthIndex;
              const hasActivity = !!activity[dateKey];

              return (
                <Pressable
                  key={dateKey}
                  onPress={() => onSelectDate(dateKey)}
                  className="flex-1 active:opacity-70"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={d.format("dddd, D MMMM YYYY")}
                  style={{
                    aspectRatio: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: isSelected
                      ? tokens.accent
                      : "transparent",
                    borderWidth: !isSelected && isToday ? 1 : 0,
                    borderColor: tokens.accent,
                  }}
                >
                  <Text
                    className={
                      isSelected
                        ? "text-white"
                        : inMonth
                          ? "text-foreground"
                          : "text-faint"
                    }
                    style={{
                      fontSize: 14,
                      fontWeight: isToday || isSelected ? "700" : "500",
                    }}
                  >
                    {d.format("D")}
                  </Text>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      marginTop: 2,
                      backgroundColor: hasActivity
                        ? isSelected
                          ? "#ffffff"
                          : tokens.accent
                        : "transparent",
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
