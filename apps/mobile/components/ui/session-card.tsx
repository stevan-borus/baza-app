import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";
import { CapsLabel } from "./studio/typography";

type SessionStatus = "booked" | "waitlisted" | "full" | "available";

type SessionAttendance = {
  consumedCount: number;
  canceledCount: number;
  totalBookings: number;
};

type SessionCardProps = {
  time: string;
  className: string;
  trainerName?: string;
  room?: string;
  bookedCount: number;
  capacity: number;
  classType?: string;
  /**
   * Carried through for back-compat with existing call sites — the
   * redesigned card no longer renders status badges, but the type stays
   * so callers don't need to change.
   */
  status: SessionStatus;
  hidden?: boolean;
  hiddenLabel?: string;
  onPress?: () => void;
  testID?: string;
  sessionId?: string;
  attendance?: SessionAttendance | null;
};

const classTypeAccentColor: Record<string, string> = {
  Yoga: "#2dd4bf",
  Pilates: "#2e5b42",
  HIIT: "#f87171",
};

/**
 * Stacked time block for the session card. Start time above a hairline
 * divider, end time below. Both digits in `tokens.fg` at the same weight.
 *
 * Fraunces-SemiBold, 22px / lineHeight 24 / letterSpacing -0.3, with
 * `fontVariant: ["tabular-nums"]` so "08:00" and "09:00" align
 * character-by-character. The block is vertically centered against the
 * middle column (no `self-start` anchor); the wrapping row has
 * `items-center` so the cross-axis alignment falls out for free.
 */
function SessionCardTime({ time }: { time: string }) {
  const parts = time.split(/\s*[-–]\s*/);
  if (parts.length !== 2) {
    return (
      <Text
        className="font-display text-foreground"
        style={{
          fontSize: 22,
          lineHeight: 24,
          letterSpacing: -0.3,
          fontVariant: ["tabular-nums"],
        }}
      >
        {time}
      </Text>
    );
  }
  const [start, end] = parts;
  return (
    <View className="items-center self-center">
      <Text
        className="font-display text-foreground"
        style={{
          fontSize: 22,
          lineHeight: 24,
          letterSpacing: -0.3,
          fontVariant: ["tabular-nums"],
        }}
      >
        {start}
      </Text>
      <View
        className="bg-glass-border self-stretch my-1"
        style={{ height: 1 }}
      />
      <Text
        className="font-display text-foreground"
        style={{
          fontSize: 22,
          lineHeight: 24,
          letterSpacing: -0.3,
          fontVariant: ["tabular-nums"],
        }}
      >
        {end}
      </Text>
    </View>
  );
}

/**
 * Capacity badge — "booked / capacity" in a neutral pill. Renders
 * `null` when capacity is 0.
 */
function SessionCapacityBadge({
  bookedCount,
  capacity,
  sessionId,
}: {
  bookedCount: number;
  capacity: number;
  sessionId?: string;
}) {
  if (capacity <= 0) return null;
  const testID = sessionId
    ? `session-card-capacity-${sessionId}`
    : "session-card-capacity";
  return (
    <View testID={testID}>
      <Badge status="neutral">
        {bookedCount} / {capacity}
      </Badge>
    </View>
  );
}

export function SessionCard({
  time,
  className,
  trainerName,
  room,
  bookedCount,
  capacity,
  classType,
  hidden,
  hiddenLabel,
  onPress,
  testID,
  sessionId,
  attendance,
}: SessionCardProps) {
  const { t } = useTranslation();
  const accentBorder = classType && classTypeAccentColor[classType] ? "left" : undefined;
  const accentBorderColor =
    classType && classTypeAccentColor[classType]
      ? classTypeAccentColor[classType]
      : "#2e5b42";

  return (
    <Pressable testID={testID} onPress={onPress} className="active:opacity-80">
      <View style={{ opacity: hidden ? 0.5 : 1 }}>
        <GlassCard
          accentBorder={accentBorder}
          accentBorderColor={accentBorderColor}
          style={{ paddingVertical: 12 }}
        >
          <View className="flex-row items-center gap-3">
            <SessionCardTime time={time} />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-sm font-body-semibold text-foreground" numberOfLines={1}>
                  {className}
                </Text>
                <SessionCapacityBadge
                  bookedCount={bookedCount}
                  capacity={capacity}
                  sessionId={sessionId}
                />
              </View>
              {trainerName ? (
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {trainerName}
                </Text>
              ) : null}
              {room ? (
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {room}
                </Text>
              ) : null}
              {hidden && hiddenLabel ? (
                <CapsLabel size={11} tracking={2.4} className="text-muted mt-1">
                  {hiddenLabel}
                </CapsLabel>
              ) : null}
              {attendance ? (
                <View
                  testID={
                    sessionId
                      ? `session-card-attendance-${sessionId}`
                      : "session-card-attendance"
                  }
                  className="flex-row items-center gap-2 mt-1"
                >
                  <Text
                    testID={
                      sessionId
                        ? `session-card-attended-${sessionId}`
                        : "session-card-attended"
                    }
                    className="text-xs text-accent font-body-semibold"
                  >
                    {t("trainer.schedule.attendance.consumed", {
                      count: attendance.consumedCount,
                    })}
                  </Text>
                  {attendance.canceledCount > 0 ? (
                    <>
                      <Text className="text-xs text-muted">·</Text>
                      <Text
                        testID={
                          sessionId
                            ? `session-card-canceled-${sessionId}`
                            : "session-card-canceled"
                        }
                        className="text-xs text-muted"
                      >
                        {t("trainer.schedule.attendance.canceled", {
                          count: attendance.canceledCount,
                        })}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </GlassCard>
      </View>
    </Pressable>
  );
}
