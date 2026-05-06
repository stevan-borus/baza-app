import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";

export const HOUR_START = 6;
export const HOUR_END = 22;
export const PX_PER_MINUTE = 1;
const HOUR_HEIGHT = 60 * PX_PER_MINUTE;

type SessionBlock = {
  id: string;
  startsAt: string;
  endsAt: string;
  classTypeName: string;
  roomName?: string | null;
  trainerName?: string | null;
  bookedCount: number;
  capacity: number;
  status?: "available" | "full" | "booked" | "waitlisted";
};

/**
 * Computes the top offset (px) and height (px) for a session block on the
 * time axis. Sessions outside [HOUR_START, HOUR_END] are clipped.
 *
 *   sessionBlockPosition({ startsAt: 06:00, endsAt: 07:00 }) → { top: 0, height: 60 }
 *   sessionBlockPosition({ startsAt: 10:30, endsAt: 11:30 }) → { top: 270, height: 60 }
 */
export function sessionBlockPosition(s: {
  startsAt: string;
  endsAt: string;
}): { top: number; height: number } {
  const start = dayjs(s.startsAt);
  const end = dayjs(s.endsAt);
  const rawStart = start.hour() * 60 + start.minute() - HOUR_START * 60;
  const rawEnd = end.hour() * 60 + end.minute() - HOUR_START * 60;
  const clipMin = 0;
  const clipMax = (HOUR_END - HOUR_START) * 60;
  const clampedStart = Math.max(clipMin, rawStart);
  const clampedEnd = Math.min(clipMax, rawEnd);
  return {
    top: clampedStart * PX_PER_MINUTE,
    height: Math.max(24, (clampedEnd - clampedStart) * PX_PER_MINUTE),
  };
}

const classTypeColors: Record<string, string> = {
  Pilates: "#2e5b42",
  Yoga: "#2dd4bf",
  HIIT: "#f87171",
};

type Props = {
  date: string;
  sessions: SessionBlock[];
  onSessionPress: (s: SessionBlock) => void;
  showNowLine?: boolean;
};

export function TimeAxisDayView({
  date,
  sessions,
  onSessionPress,
  showNowLine,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const now = dayjs();
  const isToday = now.format("YYYY-MM-DD") === date;
  const nowTop =
    isToday && showNowLine
      ? Math.max(
          0,
          now.hour() * 60 + now.minute() - HOUR_START * 60,
        ) * PX_PER_MINUTE
      : null;

  const hours: number[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  // Scroll to the first session or ~8am on mount/date change.
  useEffect(() => {
    const target =
      sessions.length > 0
        ? sessionBlockPosition(sessions[0]).top - 48
        : (8 - HOUR_START) * HOUR_HEIGHT;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
  }, [date, sessions]);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row pt-2">
        <View style={{ width: 56 }}>
          {hours.map((h) => (
            <View
              key={h}
              style={{ height: HOUR_HEIGHT, justifyContent: "flex-start" }}
            >
              <Text className="text-xs pl-6 -mt-1.5 text-muted">
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </Text>
            </View>
          ))}
        </View>
        <View
          className="flex-1 relative pr-6"
          style={{ height: (HOUR_END - HOUR_START) * HOUR_HEIGHT }}
        >
          {hours.map((h, i) => (
            <View
              key={h}
              className="absolute left-0 right-0 border-t border-glass-border"
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}

          {sessions.map((s) => {
            const { top, height } = sessionBlockPosition(s);
            const color = classTypeColors[s.classTypeName] ?? "#2e5b42";
            const isFull = s.bookedCount >= s.capacity;
            return (
              <Pressable
                key={s.id}
                testID={`session-block-${s.id}`}
                onPress={() => onSessionPress(s)}
                className="absolute left-0 right-0 active:opacity-80"
                style={{ top, height }}
              >
                <View
                  className="flex-1 rounded-xl overflow-hidden border bg-glass border-glass-border"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: color,
                  }}
                >
                  <View className="p-2 gap-0.5">
                    <Text
                      className="font-body-semibold text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {s.classTypeName}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {dayjs(s.startsAt).format("HH:mm")}–
                      {dayjs(s.endsAt).format("HH:mm")}
                      {s.roomName ? ` · ${s.roomName}` : ""}
                    </Text>
                    {isFull && height >= 60 ? (
                      <Text className="text-xs font-body-semibold text-warning">
                        Full
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}

          {nowTop !== null ? (
            <View
              className="absolute left-0 right-0 flex-row items-center"
              style={{ top: nowTop }}
              pointerEvents="none"
            >
              <View className="w-2 h-2 rounded-full -ml-1 bg-danger" />
              <View className="flex-1 h-[1px] bg-danger" />
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

export type { SessionBlock };
