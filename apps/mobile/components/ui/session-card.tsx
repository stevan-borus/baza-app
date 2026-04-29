import React from "react";
import { Pressable, Text, View } from "react-native";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";

type SessionStatus = "booked" | "waitlisted" | "full" | "available";

type SessionCardProps = {
  time: string;
  className: string;
  trainerName?: string;
  room?: string;
  bookedCount: number;
  capacity: number;
  classType?: string;
  status: SessionStatus;
  onPress?: () => void;
};

const classTypeAccentColor: Record<string, string> = {
  Yoga: "#2dd4bf",
  Pilates: "#2e5b42",
  HIIT: "#f87171",
};

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
  onPress,
}: SessionCardProps) {
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
    <Pressable onPress={onPress} className="active:opacity-80">
      <GlassCard accentBorder={accentBorder} accentBorderColor={accentBorderColor}>
        <View className="flex-row items-center gap-3">
          <Text className="text-base font-body-bold min-w-[54px] text-foreground">
            {time}
          </Text>
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
          {badgeLabel ? <Badge status={config.status}>{badgeLabel}</Badge> : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}
