import React from "react";
import { Text, XStack, YStack } from "tamagui";
import { GlassCard } from "./glass-card";
import { Badge } from "./badge";

type ClassType = "Yoga" | "Pilates" | "HIIT" | string;
type SessionStatus = "booked" | "waitlisted" | "full" | "available";

type SessionCardProps = {
  time: string;
  className: string;
  trainerName?: string;
  room?: string;
  bookedCount: number;
  capacity: number;
  classType?: ClassType;
  status: SessionStatus;
  onPress?: () => void;
};

const classTypeColors: Record<string, string> = {
  Yoga: "#2dd4bf",    // teal
  Pilates: "#2e5b42", // green
  HIIT: "#f87171",    // coral
};

const statusConfig: Record<SessionStatus, { label: string; badgeStatus: "success" | "warning" }> = {
  booked: { label: "Booked", badgeStatus: "success" },
  waitlisted: { label: "Waitlisted", badgeStatus: "warning" },
  full: { label: "Full", badgeStatus: "warning" },
  available: { label: "", badgeStatus: "success" },
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
  const borderColor = classType ? classTypeColors[classType] ?? "#2e5b42" : undefined;
  const config = statusConfig[status];
  const spotsLeft = capacity - bookedCount;
  const badgeLabel =
    status === "available" ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}` : config.label;

  return (
    <GlassCard
      interactive
      onPress={onPress}
      borderLeftWidth={borderColor ? 3 : undefined}
      borderLeftColor={borderColor as any}
    >
      <XStack items="center" gap="$3">
        <Text fontSize="$4" fontWeight="700" color="$color" minWidth={54}>
          {time}
        </Text>

        <YStack flex={1} gap="$0.5">
          <Text fontSize="$3" fontWeight="600" color="$color">
            {className}
          </Text>
          {(trainerName || room) ? (
            <Text fontSize="$2" color="$color9">
              {[trainerName, room].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </YStack>

        <Badge status={config.badgeStatus}>
          {badgeLabel}
        </Badge>
      </XStack>
    </GlassCard>
  );
}
