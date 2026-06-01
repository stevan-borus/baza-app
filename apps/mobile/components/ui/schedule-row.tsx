/**
 * ScheduleRow — the photo-tile session row used on the client home "this week"
 * list and (after the calendar redesign) the client calendar day view. A
 * horizontal card: stable photo thumbnail + time/duration/room meta, class
 * name, availability, and a right-side action label (book / join / booked).
 *
 * Extracted from app/(client)/index.tsx so the client calendar can reuse the
 * exact same row instead of the Google-style timeline (which now belongs to
 * trainers/admins).
 */
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useThemeTokens } from "@/components/ui/tokens";

const PHOTO_RINGS = require("@/assets/studio/rings.webp");
const PHOTO_PLANK = require("@/assets/studio/plank.webp");
const PHOTO_TRIPLE = require("@/assets/studio/triple.webp");
const PHOTO_REFORMER = require("@/assets/studio/reformer-1.webp");

const SCHEDULE_PHOTOS = [PHOTO_RINGS, PHOTO_PLANK, PHOTO_REFORMER, PHOTO_TRIPLE];

/** Stable photo for a session id, so the same class always shows the same photo. */
export function photoForSessionId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SCHEDULE_PHOTOS[h % SCHEDULE_PHOTOS.length];
}

export type ScheduleRowSession = {
  id: string;
  classTypeName: string;
  startsAt: Date | string;
  endsAt: Date | string;
  roomName: string | null;
  availableSlots: number;
  capacity: number;
  isBookedByMe?: boolean;
};

export function ScheduleRow({
  session,
  onPress,
}: {
  session: ScheduleRowSession;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const start = dayjs(session.startsAt);
  const end = dayjs(session.endsAt);
  const full = session.availableSlots === 0;
  const bookedByMe = !!session.isBookedByMe;
  const photo = photoForSessionId(session.id);

  return (
    <Pressable onPress={onPress} testID={`schedule-row-${session.id}`}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 20,
          gap: 14,
        }}
      >
        {/* Photo tile */}
        <Image
          source={photo}
          style={{
            width: 64,
            height: 64,
            borderRadius: 4,
            backgroundColor: tokens.surface2,
          }}
          resizeMode="cover"
        />

        {/* Body */}
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontFamily: "AlbertSans-SemiBold",
              fontSize: 11,
              color: tokens.muted,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            {start.format("HH:mm")} ·{" "}
            {t("client.home.minutesShort", { count: end.diff(start, "minute") })}
            {session.roomName ? ` · ${session.roomName}` : ""}
          </Text>
          <Text
            style={{
              fontFamily: "AlbertSans-SemiBold",
              fontSize: 16,
              color: tokens.foreground,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {session.classTypeName}
          </Text>
          <Text
            style={{
              fontFamily: "AlbertSans-Regular",
              fontSize: 12,
              color: full ? tokens.faint : tokens.accent,
              letterSpacing: 0.2,
            }}
          >
            {full
              ? t("client.home.waitlistAvailable")
              : t("client.home.of", {
                  available: session.availableSlots,
                  capacity: session.capacity,
                })}
          </Text>
        </View>

        {/* Action label — confirms state / invites the tap. */}
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: 11,
            color: bookedByMe ? tokens.accent : tokens.foreground,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          {bookedByMe
            ? t("client.home.booked")
            : full
              ? t("client.home.join")
              : t("client.home.book")}
        </Text>
      </View>
    </Pressable>
  );
}
