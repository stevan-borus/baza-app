/**
 * StudioWeekStrip — 7 day pills (DOW + numeral + dot indicator).
 *
 * Renders a week starting at `weekStart` (defaults to today). The active
 * day is filled in ink; non-active days have a hairline border. A dot
 * appears under days that have at least one session — sage on idle days,
 * white on the active day.
 *
 * Optional prev/next arrows let callers paginate the visible week (e.g.
 * the Calendar tab). Callers own the week boundary: the paginated surfaces
 * pass `useWeekNavigation`'s `weekStart`, and the client home tab passes
 * `startOfMondayWeek(selectedDay)` so its "OVA NEDELJA" strip is a real
 * Monday-to-Sunday calendar week rather than a rolling 7-day window.
 */
import dayjs from "dayjs";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";
import { CapsLabel } from "./typography";

export type StudioWeekStripProps = {
  /**
   * First day of the visible week; the strip shows this day plus 6 days
   * forward. Defaults to today, which yields a rolling window — pass a real
   * week start (see `startOfMondayWeek` / `startOfLocaleWeek`) for a
   * calendar week.
   */
  weekStart?: dayjs.Dayjs;
  /** Currently selected day (filled in ink). */
  selected: dayjs.Dayjs;
  onSelect: (d: dayjs.Dayjs) => void;
  /** YYYY-MM-DD → 1+ if there are sessions on that day. */
  sessionsByDay: Record<string, number>;
  /**
   * YYYY-MM-DD → true when the viewing client has a booking that day.
   *
   * Deliberately separate from `sessionsByDay`: "the studio runs classes
   * today" and "you reserved one" are different facts and a day is commonly
   * both. Only the client surfaces pass it; staff screens omit it and keep
   * the plain sessions dot.
   */
  bookedByDay?: Record<string, boolean>;
  /** When set, prev/next arrows render above the row. */
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Optional centered label (e.g. "4. Maj — 10. Maj"). */
  rangeLabel?: string;
};

export function StudioWeekStrip({
  weekStart,
  selected,
  onSelect,
  sessionsByDay,
  bookedByDay,
  onPrevWeek,
  onNextWeek,
  rangeLabel,
}: StudioWeekStripProps) {
  const tokens = useThemeTokens();
  const { t } = useTranslation();
  const start = (weekStart ?? dayjs()).startOf("day");
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
  const showHeader = !!(onPrevWeek || onNextWeek || rangeLabel);

  return (
    <View>
      {showHeader ? (
        <View className="flex-row items-center justify-between px-5 mb-3">
          {onPrevWeek ? (
            <Pressable
              onPress={onPrevWeek}
              hitSlop={12}
              android_ripple={null}
              className="active:opacity-60 w-9 h-9 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              testID="week-strip-prev"
            >
              <Icon name="chevron-left" size={20} color={tokens.foreground} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          {rangeLabel ? (
            <CapsLabel size={11} tracking={1.6}>
              {rangeLabel}
            </CapsLabel>
          ) : (
            <View />
          )}
          {onNextWeek ? (
            <Pressable
              onPress={onNextWeek}
              hitSlop={12}
              android_ripple={null}
              className="active:opacity-60 w-9 h-9 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Next week"
              testID="week-strip-next"
            >
              <Icon name="chevron-right" size={20} color={tokens.foreground} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      ) : null}

      <View className="flex-row px-5" style={{ gap: 6 }}>
        {days.map((d) => {
          const isSelected = d.isSame(selected, "day");
          const isToday = d.isSame(dayjs(), "day");
          const dateKey = d.format("YYYY-MM-DD");
          const count = sessionsByDay[dateKey] ?? 0;
          const isBooked = !!bookedByDay?.[dateKey];
          // Selected wins; today (when unselected) gets a green border so
          // the brand color marks "today" without competing with selection.
          const containerCls = isSelected
            ? "bg-foreground"
            : isToday
              ? "border border-accent active:opacity-70"
              : "border border-glass-border active:opacity-70";
          const dowCls = isSelected
            ? "text-background opacity-60"
            : isToday
              ? "text-accent"
              : "text-faint";
          const numeralCls = isSelected
            ? "text-background"
            : isToday
              ? "text-accent"
              : "text-foreground";
          return (
            <Pressable
              key={d.toString()}
              testID={`week-strip-day-${dateKey}`}
              onPress={() => onSelect(d)}
              android_ripple={null}
              className={`flex-1 py-3 items-center rounded ${containerCls}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={[
                d.format("dddd, D MMMM"),
                isBooked
                  ? t("client.calendar.a11yBookedDay")
                  : count > 0
                    ? t("client.calendar.a11yHasSessions")
                    : null,
              ]
                .filter(Boolean)
                .join(" — ")}
            >
              <Text
                className={dowCls}
                style={{
                  fontFamily: "AlbertSans-SemiBold",
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {d.format("ddd")}
              </Text>
              <Text
                className={numeralCls}
                style={{
                  fontFamily: "AlbertSans-SemiBold",
                  fontSize: 18,
                  marginTop: 4,
                  letterSpacing: -0.3,
                }}
              >
                {d.format("D")}
              </Text>
              {/*
                Two distinct indicators, told apart by SHAPE and SIZE — not
                colour alone. A booked day gets a larger hollow ring; a day
                that merely has sessions keeps the small solid dot.
                Colour-only encoding would be invisible
                to the studio's older and low-vision clients.
              */}
              {isBooked ? (
                <View
                  testID="week-strip-booked-marker"
                  style={{
                    marginTop: 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: isSelected ? tokens.background : tokens.accent,
                    // Hollow centre — the ring is what distinguishes "booked"
                    // from the solid has-sessions dot at a glance.
                    backgroundColor: "transparent",
                  }}
                />
              ) : count > 0 ? (
                <View
                  testID="week-strip-sessions-dot"
                  style={{
                    marginTop: 6,
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: isSelected ? tokens.background : tokens.accent,
                  }}
                />
              ) : (
                <View style={{ marginTop: 6, width: 4, height: 4 }} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
