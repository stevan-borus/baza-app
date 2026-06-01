import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import {
  HOUR_START,
  HOUR_END,
  PX_PER_MINUTE,
  HOUR_HEIGHT,
  sessionBlockPosition,
  layoutSessions,
} from "@/components/ui/time-axis-layout";

// Re-exported so existing importers of these from the component keep working.
export {
  HOUR_START,
  HOUR_END,
  PX_PER_MINUTE,
  sessionBlockPosition,
  layoutSessions,
} from "@/components/ui/time-axis-layout";

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

const classTypeColors: Record<string, string> = {
  Pilates: "#2e5b42",
  Yoga: "#2dd4bf",
  HIIT: "#f87171",
};

/** Low-opacity wash of a #rrggbb class color for the block background. */
function tintBg(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

type Props = {
  date: string;
  sessions: SessionBlock[];
  onSessionPress: (s: SessionBlock) => void;
  showNowLine?: boolean;
  /**
   * When the timeline sits inside a page that already scrolls (staff screens),
   * render the grid in a plain View instead of its own ScrollView so we don't
   * nest two vertical scrollers. The grid has a fixed height, so the outer
   * page scroll handles it. Defaults to false (own ScrollView).
   */
  embedded?: boolean;
};

export function TimeAxisDayView({
  date,
  sessions,
  onSessionPress,
  showNowLine,
  embedded = false,
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

  // Column assignment for overlapping sessions, keyed by id for lookup in the
  // render loop below.
  const columns = new Map(
    layoutSessions(sessions).map((c) => [c.id, c]),
  );

  // Scroll to the first session or ~8am on mount/date change. Only when we own
  // the ScrollView — embedded mode lets the parent page handle scrolling.
  useEffect(() => {
    if (embedded) return;
    const target =
      sessions.length > 0
        ? sessionBlockPosition(sessions[0]).top - 48
        : (8 - HOUR_START) * HOUR_HEIGHT;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
  }, [date, sessions, embedded]);

  const grid = (
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
            // On short (clamped) blocks the secondary line is dropped so the
            // class name never gets clipped mid-line.
            const compact = height < 44;
            // Column layout: concurrent sessions (e.g. two rooms at once) sit
            // side-by-side instead of stacking. `col`/`cols` come from the
            // shared layout helper. Full-width when alone.
            const { col, cols } = columns.get(s.id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / cols;
            return (
              <Pressable
                key={s.id}
                testID={`session-block-${s.id}`}
                onPress={() => onSessionPress(s)}
                className="absolute active:opacity-80"
                style={{
                  top,
                  // 2px bottom inset so back-to-back blocks don't touch.
                  height: Math.max(22, height - 2),
                  left: `${col * widthPct}%`,
                  width: `${widthPct}%`,
                  // Small right gutter; doubles as the gap between columns.
                  paddingRight: 4,
                }}
              >
                <View
                  className="flex-1 rounded-xl overflow-hidden justify-center"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: color,
                    backgroundColor: tintBg(color),
                  }}
                >
                  <View className="px-2.5 gap-0.5">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        className="font-body-semibold text-sm text-foreground flex-1"
                        numberOfLines={1}
                      >
                        {s.classTypeName}
                      </Text>
                      {isFull ? <Badge status="danger">Full</Badge> : null}
                    </View>
                    {compact ? null : (
                      <Text className="text-xs text-muted" numberOfLines={1}>
                        {dayjs(s.startsAt).format("HH:mm")}–
                        {dayjs(s.endsAt).format("HH:mm")}
                        {s.roomName ? ` · ${s.roomName}` : ""}
                      </Text>
                    )}
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
  );

  if (embedded) return grid;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {grid}
    </ScrollView>
  );
}

export type { SessionBlock };
