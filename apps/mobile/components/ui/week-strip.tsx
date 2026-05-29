/**
 * WeekStrip — fixed-width 7-column day picker.
 *
 * - Always renders 7 columns spanning the available width (no horizontal
 *   scroll, fits any phone size).
 * - First column honors the active dayjs locale's first day of week
 *   (`sr` → Monday, `en` → Sunday).
 * - Selecting a day calls `onSelectDate` only — it never modifies the
 *   visible week. The week is owned by the parent via `weekStart` and
 *   `onPrevWeek` / `onNextWeek` arrows. Arrows page week-by-week, never
 *   month-by-month.
 *
 * The `selectedDate` / `onSelectDate` / `activityByDate` props are kept
 * stable for backwards compatibility with existing callers. When
 * `weekStart` is omitted, the week shown is derived from `selectedDate`
 * (legacy behavior, used by the home overview where there is no nav).
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "./tokens";

type ActivityValue = boolean | number | string;

type WeekStripProps = {
  /** Selected day, formatted as YYYY-MM-DD. */
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /**
   * First day of the displayed week. When provided, the strip renders this
   * exact week regardless of where `selectedDate` falls. When omitted, the
   * week containing `selectedDate` is shown (legacy mode, no arrows).
   */
  weekStart?: dayjs.Dayjs;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Optional dot indicator below each date when truthy. */
  activity?: Record<string, ActivityValue>;
  /** Legacy alias for `activity`. */
  activityByDate?: Record<string, ActivityValue>;
};

/**
 * Returns the start-of-week dayjs for the given date, using the active
 * dayjs locale to decide the first weekday (Mon for sr, Sun for en).
 *
 * The `weekday` plugin maps weekday(0) to the locale's first day.
 */
export function startOfLocaleWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  // dayjs `weekday(0)` returns the locale's first weekday for the same
  // calendar week as `d`. Strip time-of-day to keep arithmetic stable
  // across DST transitions.
  return d.weekday(0).startOf("day");
}

export function WeekStrip({
  selectedDate,
  onSelectDate,
  weekStart,
  onPrevWeek,
  onNextWeek,
  activity,
  activityByDate,
}: WeekStripProps) {
  const tokens = useThemeTokens();
  const { i18n } = useTranslation();
  const activityMap = activity ?? activityByDate ?? {};
  // Day-before-month for sr/most non-en locales, month-before-day for en.
  const lang = i18n.language === "en" ? "en" : "sr";
  const rangeFormat = lang === "en" ? "MMM D" : "D. MMM";

  // Resolve the displayed week. When `weekStart` is supplied, use it
  // verbatim — selecting a day must NOT shift the week boundary. Re-apply
  // the active locale: dayjs instances carry their own locale, so a
  // `weekStart` created when the app was Serbian would keep formatting in
  // Serbian even after the user switches to English.
  const weekAnchor = (weekStart
    ? weekStart.startOf("day")
    : startOfLocaleWeek(dayjs(selectedDate))).locale(lang);

  const days: dayjs.Dayjs[] = [];
  for (let i = 0; i < 7; i++) days.push(weekAnchor.add(i, "day"));

  const todayKey = dayjs().format("YYYY-MM-DD");
  const showArrows = !!(onPrevWeek || onNextWeek);

  return (
    <View className="flex-col gap-2">
      {showArrows ? (
        <View className="flex-row justify-between items-center">
          <Pressable
            onPress={onPrevWeek}
            disabled={!onPrevWeek}
            hitSlop={12}
            className="active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            testID="week-strip-prev"
          >
            <FontAwesome
              name="chevron-left"
              size={14}
              color={tokens.muted}
            />
          </Pressable>
          <Text
            className="font-body-semibold text-foreground"
            style={{ fontSize: 14, letterSpacing: -0.2 }}
          >
            {weekAnchor.format(rangeFormat)} – {weekAnchor.add(6, "day").format(rangeFormat)}
          </Text>
          <Pressable
            onPress={onNextWeek}
            disabled={!onNextWeek}
            hitSlop={12}
            className="active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel="Next week"
            testID="week-strip-next"
          >
            <FontAwesome
              name="chevron-right"
              size={14}
              color={tokens.muted}
            />
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row" style={{ gap: 4 }}>
        {days.map((d) => {
          const dateKey = d.format("YYYY-MM-DD");
          const isSelected = dateKey === selectedDate;
          const isToday = dateKey === todayKey;
          const hasActivity = !!activityMap[dateKey];
          const dayLabel = d.format("dd"); // localized 2-letter weekday

          return (
            <Pressable
              key={dateKey}
              testID={`week-strip-day-${dateKey}`}
              onPress={() => onSelectDate(dateKey)}
              className="flex-1 active:opacity-70"
              style={{ alignItems: "center" }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={d.format("dddd, D MMMM")}
            >
              <Text
                className="text-muted"
                style={{
                  fontSize: 11,
                  fontWeight: "500",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {dayLabel}
              </Text>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected
                    ? tokens.accent
                    : "transparent",
                  borderWidth: !isSelected && isToday ? 1 : 0,
                  borderColor: tokens.accent,
                }}
              >
                <Text
                  className={isSelected ? "text-white" : "text-foreground"}
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  {d.format("D")}
                </Text>
              </View>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  marginTop: 4,
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
    </View>
  );
}
