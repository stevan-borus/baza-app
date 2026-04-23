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

const classTypeBorder: Record<string, string> = {
  Yoga: "border-l-[#2dd4bf]",
  Pilates: "border-l-accent",
  HIIT: "border-l-[#f87171]",
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
  const accentBorder = classType && classTypeBorder[classType] ? "left" : undefined;

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <GlassCard
        accentBorder={accentBorder}
        accentBorderColorClass={
          classType && classTypeBorder[classType]
            ? classTypeBorder[classType]
            : "border-accent"
        }
      >
        <View className="flex-row items-center gap-3">
          <Text className="text-base font-bold text-foreground min-w-[54px]">
            {time}
          </Text>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-foreground">
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
