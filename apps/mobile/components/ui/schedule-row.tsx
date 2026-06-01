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

// One photo per class type, so every Reformer session shows the same image
// (not a random per-session photo). Known class types are pinned; anything
// unmapped falls back to a stable hash of the name so it's still consistent.
const PHOTO_BY_CLASS_TYPE: Record<string, number> = {
  "Reformer pilates": PHOTO_REFORMER,
  "Energy pilates": PHOTO_PLANK,
  "Golden age pilates": PHOTO_RINGS,
  "Moms&Minis": PHOTO_TRIPLE,
};

/** Stable photo for a class type, so all sessions of that class share one image. */
export function photoForClassType(name: string) {
  const pinned = PHOTO_BY_CLASS_TYPE[name];
  if (pinned) return pinned;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
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
  const photo = photoForClassType(session.classTypeName);

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
              // accentLight is theme-aware (lighter sage on dark); the plain
              // accent green is illegible on the dark canvas.
              color: full ? tokens.faint : tokens.accentLight,
              letterSpacing: 0.2,
            }}
          >
            {full
              ? t("client.home.full")
              : session.availableSlots >= session.capacity
                ? t("client.home.allFree")
                : t("client.home.spotsFree", { count: session.availableSlots })}
          </Text>
        </View>

        {/* Action label — confirms state / invites the tap. A full session still
            shows "Rezerviši" (the sheet handles the waitlist join path); we don't
            surface the waitlist on the row itself. */}
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: 11,
            color: bookedByMe ? tokens.accentLight : tokens.foreground,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          {bookedByMe ? t("client.home.booked") : t("client.home.book")}
        </Text>
      </View>
    </Pressable>
  );
}
