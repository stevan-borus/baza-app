/**
 * StudioWeekStrip — 7 day pills (DOW + numeral + dot indicator).
 *
 * Renders a week starting at `weekStart` (defaults to today). The active
 * day is filled in ink; non-active days have a hairline border. A dot
 * appears under days that have at least one session — sage on idle days,
 * white on the active day.
 *
 * Optional prev/next arrows let callers paginate the visible week (e.g.
 * the Calendar tab); the home tab uses the default fixed-window mode.
 */
import dayjs from "dayjs";
import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useThemeTokens } from "@/components/ui/tokens";
import { CapsLabel } from "./typography";

export type StudioWeekStripProps = {
  /** Anchor day; the strip shows this day plus 6 days forward. */
  weekStart?: dayjs.Dayjs;
  /** Currently selected day (filled in ink). */
  selected: dayjs.Dayjs;
  onSelect: (d: dayjs.Dayjs) => void;
  /** YYYY-MM-DD → 1+ if there are sessions on that day. */
  sessionsByDay: Record<string, number>;
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
  onPrevWeek,
  onNextWeek,
  rangeLabel,
}: StudioWeekStripProps) {
  const tokens = useThemeTokens();
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
              <Feather name="chevron-left" size={20} color={tokens.foreground} />
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
              <Feather name="chevron-right" size={20} color={tokens.foreground} />
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
          const count = sessionsByDay[d.format("YYYY-MM-DD")] ?? 0;
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
              testID={`week-strip-day-${d.format("YYYY-MM-DD")}`}
              onPress={() => onSelect(d)}
              android_ripple={null}
              className={`flex-1 py-3 items-center rounded ${containerCls}`}
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
              <View
                style={{
                  marginTop: 6,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    count > 0
                      ? isSelected
                        ? tokens.background
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
