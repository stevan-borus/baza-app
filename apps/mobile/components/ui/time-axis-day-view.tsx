import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { IntermediateBadge } from "@/components/ui/intermediate-badge";
import { MixedGroupBadge } from "@/components/ui/mixed-group-badge";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  HOUR_START,
  HOUR_END,
  PX_PER_MINUTE,
  HOUR_HEIGHT,
  sessionBlockPosition,
  layoutSessions,
  tintBg,
  tintText,
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
  /** Admin-set "intermediate" marking for this occurrence; absent = unmarked. */
  isIntermediate?: boolean;
  isMixedGroup?: boolean;
  /**
   * Nobody booked, and the session's empty-booking cutoff has passed —
   * clients can no longer sign up. Display-only; staff still book freely.
   * Absent (older cached payloads) reads as open.
   */
  emptyCutoffLocked?: boolean;
  status?: "available" | "full" | "booked" | "waitlisted";
};

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
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const now = dayjs();
  const isToday = now.format("YYYY-MM-DD") === date;
  // Minutes from the top of the visible axis. Negative before HOUR_START,
  // beyond the grid after HOUR_END.
  const nowMinutes = now.hour() * 60 + now.minute() - HOUR_START * 60;
  const axisMinutes = (HOUR_END - HOUR_START) * 60;
  // Only show the marker when "now" actually falls inside the visible
  // window (6 AM–10 PM). Outside it the studio is closed and there's nothing
  // to mark — clamping to an edge would falsely read as "it's 6 AM now".
  const nowTop =
    isToday && showNowLine && nowMinutes >= 0 && nowMinutes <= axisMinutes
      ? nowMinutes * PX_PER_MINUTE
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
        <View style={{ width: 48 }}>
          {hours.map((h) => (
            <View
              key={h}
              style={{ height: HOUR_HEIGHT, justifyContent: "flex-start" }}
            >
              <Text className="text-xs -mt-1.5 text-muted">
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </Text>
            </View>
          ))}
        </View>
        <View
          className="flex-1 relative"
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
            // Closed slots always read as a lock on the capacity pill, never as
            // a "Zatvoreno" word. One representation per state: mixing the two
            // down a single day made the grid harder to scan than either alone,
            // because the eye has to learn that a word and a glyph mean the
            // same thing. The pill is also where the fact already lives — the
            // cutoff only fires on an empty session, so a locked block always
            // reads "0/N" and the word was restating its neighbour.
            const cutoffMarkProps = s.emptyCutoffLocked
              ? {
                  testID: `session-block-empty-cutoff-${s.id}`,
                  accessibilityLabel: t("admin.dayView.emptyCutoffChipA11y"),
                }
              : {};
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
                  // Right gutter only when columns share the row — it's the gap
                  // between concurrent blocks. A lone block runs full-width to
                  // the grid edge so it doesn't look inset from the right.
                  paddingRight: cols > 1 ? 6 : 0,
                }}
              >
                <View
                  className="flex-1 rounded-xl overflow-hidden justify-center"
                  style={{
                    // 4px colored spine. overflow-hidden + rounded-xl clips its
                    // outer corners to match the card radius automatically.
                    borderLeftWidth: 4,
                    borderLeftColor: color,
                    backgroundColor: tintBg(color, tokens.background),
                  }}
                >
                  <View className="px-2.5 flex-row items-center gap-2">
                    {/* The class name is the highest-value thing on the card —
                        it's the only element that says WHICH session this is —
                        so its column takes every pixel the badges don't claim
                        (flexGrow 1) and is the last to give any back.
                        minWidth 0 has to be on EVERY level of this chain: a
                        flex item's default min-width is its content, so one
                        missing level and a long name ("StrongHer (funkcionalni
                        trening)") pushes the column past the card and runs
                        under the capacity badge instead of ellipsizing. */}
                    <View
                      className="flex-1 gap-0.5"
                      style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
                    >
                      <View
                        className="flex-row items-center gap-1.5"
                        style={{ minWidth: 0 }}
                      >
                        <Text
                          className="font-body-semibold text-sm text-foreground"
                          numberOfLines={1}
                          style={{ flexShrink: 1, minWidth: 0 }}
                        >
                          {s.classTypeName}
                        </Text>
                        {/* Compact blocks have no meta line — the session marks
                            have nowhere else to go, so they ride the title. */}
                        {compact ? (
                          <>
                            <IntermediateBadge
                              isIntermediate={s.isIntermediate}
                            />
                            <MixedGroupBadge isMixedGroup={s.isMixedGroup} />
                          </>
                        ) : null}
                      </View>
                      {compact ? null : (
                        <View className="flex-row items-center gap-1.5">
                          <Text
                            className="text-xs"
                            style={{
                              flexShrink: 1,
                              color: tintText(color, tokens.foreground),
                            }}
                            numberOfLines={1}
                          >
                            {dayjs(s.startsAt).format("HH:mm")}–
                            {dayjs(s.endsAt).format("HH:mm")}
                            {s.roomName ? ` · ${s.roomName}` : ""}
                          </Text>
                          <IntermediateBadge isIntermediate={s.isIntermediate} />
                          <MixedGroupBadge isMixedGroup={s.isMixedGroup} />
                        </View>
                      )}
                    </View>
                    {/* Signup closed on an empty slot. Staff planning around
                        the empty slot is the whole reason the cutoff exists,
                        so it has to read from the grid without opening the
                        session — but the class name is what identifies WHICH
                        session, so the name outranks it.

                        So the state is a lock glyph merged into the capacity
                        pill — ~55pt for both, against ~110pt for a separate
                        word badge, which is the difference between "Reformer
                        pilates" and "R." on a shared row. Nothing is lost:
                        isEmptySessionCutoffLocked() returns false as soon as
                        anyone books, so a locked block always reads "0/N" and
                        the word only restated its neighbour. The a11y label
                        carries the meaning the glyph can't.

                        Capacity is always visible and vertically centered.
                        Full → danger pill (red); otherwise an opaque on-block
                        pill tinted from the class color so it stays legible
                        against the green fill (the shared neutral Badge's
                        glass bg + muted text washed out here). */}
                    {isFull ? (
                      // Locked-and-full can't happen from the server (the
                      // cutoff needs zero bookings), but a stale cached payload
                      // can still land here, so the mark keeps its testID and
                      // label rather than vanishing.
                      <View {...cutoffMarkProps} style={{ flexShrink: 0 }}>
                        <Badge status="danger">
                          {s.bookedCount}/{s.capacity}
                        </Badge>
                      </View>
                    ) : (
                      <View
                        {...cutoffMarkProps}
                        className="px-2.5 py-1 rounded-full flex-row items-center gap-1"
                        style={{
                          backgroundColor: tintBg(color, tokens.background, 0.32),
                          flexShrink: 0,
                        }}
                      >
                        {s.emptyCutoffLocked ? (
                          <Icon
                            name="lock"
                            size={11}
                            color={tintText(color, tokens.foreground)}
                            strokeWidth={2.5}
                          />
                        ) : null}
                        <Text
                          className="text-xs font-body-semibold"
                          style={{ color: tintText(color, tokens.foreground) }}
                        >
                          {s.bookedCount}/{s.capacity}
                        </Text>
                      </View>
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
              <View className="w-2 h-2 rounded-full -ml-1 bg-accent" />
              <View className="flex-1 h-[1px] bg-accent" />
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
