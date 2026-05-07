import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";

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
 * Renders a "HH:MM - HH:MM" time range as two stacked lines with a slight
 * diagonal offset so the column doesn't dominate the card width.
 */
function SessionCardTime({ time }: { time: string }) {
  const parts = time.split(/\s*[-–]\s*/);
  if (parts.length !== 2) {
    return (
      <Text className="text-base font-body-bold min-w-[54px] text-foreground">
        {time}
      </Text>
    );
  }
  const [start, end] = parts;
  return (
    <View style={{ minWidth: 54 }}>
      <Text className="text-base font-body-bold text-foreground">{start}</Text>
      <Text
        className="text-xs font-body-semibold text-muted"
        style={{ marginLeft: 14, marginTop: -2 }}
      >
        {end}
      </Text>
    </View>
  );
}

const statusConfig: Record<SessionStatus, { label: string; status: "success" | "warning" }> = {
  booked: { label: "Booked", status: "success" },
  waitlisted: { label: "Waitlisted", status: "warning" },
  full: { label: "Full", status: "warning" },
  available: { label: "", status: "success" },
};

export function SessionCard({
  time,
  className,
  trainerName,
  room,
  bookedCount,
  capacity,
  classType,
  status,
  hidden,
  hiddenLabel,
  onPress,
  testID,
  sessionId,
  attendance,
}: SessionCardProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  const spotsLeft = capacity - bookedCount;
  const badgeLabel =
    status === "available" ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}` : config.label;
  const accentBorder = classType && classTypeAccentColor[classType] ? "left" : undefined;
  const accentBorderColor =
    classType && classTypeAccentColor[classType]
      ? classTypeAccentColor[classType]
      : "#2e5b42";

  return (
    <Pressable testID={testID} onPress={onPress} className="active:opacity-80">
      <View style={{ opacity: hidden ? 0.5 : 1 }}>
        <GlassCard accentBorder={accentBorder} accentBorderColor={accentBorderColor}>
          <View className="flex-col gap-2">
            <View className="flex-row items-center gap-3">
              <SessionCardTime time={time} />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-body-semibold text-foreground">
                  {className}
                </Text>
                {trainerName || room ? (
                  <Text className="text-xs text-muted">
                    {[trainerName, room].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              {hidden && hiddenLabel ? (
                <Badge status="warning">{hiddenLabel}</Badge>
              ) : badgeLabel ? (
                <Badge status={config.status}>{badgeLabel}</Badge>
              ) : null}
            </View>
            {attendance ? (
              <View
                testID={
                  sessionId
                    ? `session-card-attendance-${sessionId}`
                    : "session-card-attendance"
                }
                className="flex-row items-center gap-2 pl-[66px]"
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
        </GlassCard>
      </View>
    </Pressable>
  );
}
