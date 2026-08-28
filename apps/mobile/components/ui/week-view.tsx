/**
 * WeekView — 7-column timeline grid for a single week.
 *
 * Vertical hour rail (HOUR_START..HOUR_END), seven equal-width columns
 * (one per weekday starting at `weekStart`). Sessions render as colored
 * blocks at their `startsAt` offset, with height proportional to
 * duration. Tapping a block calls `onSessionPress` with the session id.
 *
 * The component scrolls vertically; columns share width via `flex: 1`
 * so it fits any phone screen without horizontal scroll.
 */
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { useThemeTokens } from "./tokens";

export const WEEK_HOUR_START = 6;
export const WEEK_HOUR_END = 22;
const HOUR_HEIGHT = 48;

type WeekSession = {
  id: string;
  /** ISO string or Date (the API returns Date after Zod parse). */
  startsAt: string | Date;
  endsAt: string | Date;
  classTypeName?: string;
  roomName?: string | null;
};

type Props = {
  weekStart: dayjs.Dayjs;
  sessions: WeekSession[];
  onSessionPress: (id: string) => void;
};

const classTypeColors: Record<string, string> = {
  Pilates: "#2e5b42",
  Yoga: "#2dd4bf",
  HIIT: "#f87171",
};

function blockGeometry(s: WeekSession): { top: number; height: number } {
  const start = dayjs(s.startsAt);
  const end = dayjs(s.endsAt);
  const rawStart = start.hour() * 60 + start.minute() - WEEK_HOUR_START * 60;
  const rawEnd = end.hour() * 60 + end.minute() - WEEK_HOUR_START * 60;
  const clipMin = 0;
  const clipMax = (WEEK_HOUR_END - WEEK_HOUR_START) * 60;
  const clampedStart = Math.max(clipMin, rawStart);
  const clampedEnd = Math.min(clipMax, rawEnd);
  const minutesPerPx = 60 / HOUR_HEIGHT;
  return {
    top: clampedStart / minutesPerPx,
    height: Math.max(20, (clampedEnd - clampedStart) / minutesPerPx),
  };
}

export function WeekView({ weekStart, sessions, onSessionPress }: Props) {
  const tokens = useThemeTokens();
  const totalMinutes = (WEEK_HOUR_END - WEEK_HOUR_START) * 60;
  const totalHeight = (totalMinutes / 60) * HOUR_HEIGHT;
  const todayKey = dayjs().format("YYYY-MM-DD");

  const days: dayjs.Dayjs[] = [];
  for (let i = 0; i < 7; i++) days.push(weekStart.add(i, "day"));

  const hours: number[] = [];
  for (let h = WEEK_HOUR_START; h <= WEEK_HOUR_END; h++) hours.push(h);

  // Group sessions by day-of-week index
  const sessionsByDay: WeekSession[][] = Array.from({ length: 7 }, () => []);
  for (const s of sessions) {
    const dateKey = dayjs(s.startsAt).format("YYYY-MM-DD");
    const idx = days.findIndex((d) => d.format("YYYY-MM-DD") === dateKey);
    if (idx >= 0) sessionsByDay[idx].push(s);
  }

  return (
    <View className="flex-col">
      {/* Day header row */}
      <View className="flex-row" style={{ paddingLeft: 44 }}>
        {days.map((d) => {
          const isToday = d.format("YYYY-MM-DD") === todayKey;
          return (
            <View
              key={d.format("YYYY-MM-DD")}
              className="flex-1"
              style={{ alignItems: "center", paddingVertical: 6 }}
            >
              <Text
                className="text-muted"
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {d.format("dd")}
              </Text>
              <Text
                className="text-foreground"
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: isToday ? tokens.accent : tokens.foreground,
                }}
              >
                {d.format("D")}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        <View className="flex-row" style={{ height: totalHeight }}>
          {/* Time gutter */}
          <View style={{ width: 44 }}>
            {hours.map((h, i) => (
              <View
                key={h}
                style={{
                  position: "absolute",
                  top: i * HOUR_HEIGHT - 6,
                  left: 0,
                  right: 0,
                }}
              >
                <Text
                  className="text-muted"
                  style={{
                    fontSize: 10,
                    fontWeight: "500",
                    textAlign: "right",
                    paddingRight: 6,
                  }}
                >
                  {h === 12 ? "12" : h > 12 ? `${h - 12}` : `${h}`}
                </Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          <View className="flex-1 flex-row relative">
            {/* Horizontal hour grid lines */}
            {hours.map((h, i) => (
              <View
                key={`grid-${h}`}
                className="absolute left-0 right-0 border-t border-glass-border"
                style={{ top: i * HOUR_HEIGHT }}
              />
            ))}

            {days.map((d, dayIdx) => (
              <View
                key={d.format("YYYY-MM-DD")}
                className="flex-1 relative"
                style={{
                  borderLeftWidth: dayIdx === 0 ? 0 : 1,
                  borderLeftColor: tokens.glassBorder,
                }}
              >
                {sessionsByDay[dayIdx].map((s) => {
                  const { top, height } = blockGeometry(s);
                  const color =
                    classTypeColors[s.classTypeName ?? ""] ?? tokens.accent;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => onSessionPress(s.id)}
                      className="absolute active:opacity-80"
                      style={{
                        top,
                        height,
                        left: 1,
                        right: 1,
                        backgroundColor: tokens.accentSoft,
                        borderLeftWidth: 3,
                        borderLeftColor: color,
                        borderRadius: 6,
                        padding: 3,
                        overflow: "hidden",
                      }}
                    >
                      <Text
                        className="text-foreground"
                        style={{ fontSize: 10, fontWeight: "700", minWidth: 0 }}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {s.classTypeName ?? ""}
                      </Text>
                      {height >= 32 ? (
                        <Text
                          className="text-muted"
                          style={{ fontSize: 9 }}
                          numberOfLines={1}
                        >
                          {dayjs(s.startsAt).format("HH:mm")}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export type { WeekSession };
