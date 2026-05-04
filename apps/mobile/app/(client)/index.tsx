/**
 * Client Home — the Studio look.
 *
 * Bone canvas, near-black ink, forest green reserved as signature (logo +
 * package card + status text). Studio photography drives the hero and
 * schedule rows. ALL-CAPS tracked section labels. Black is the primary CTA.
 *
 * Self-renders its top safe-area + Baza-logo header (no green AppHeader).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import {
  trainerNotesQueries,
  type TrainerNote,
} from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { useProfileSheet } from "@/components/ui/profile-sheet";

dayjs.extend(relativeTime);

// Studio photography (from baza-landing/public/optimized/gal/)
const PHOTO_HERO = require("@/assets/studio/group.webp");      // BAZA neon, 4 women on reformers
const PHOTO_RINGS = require("@/assets/studio/rings.webp");
const PHOTO_PLANK = require("@/assets/studio/plank.webp");
const PHOTO_TRIPLE = require("@/assets/studio/triple.webp");
const PHOTO_REFORMER = require("@/assets/studio/reformer-1.webp");
const LOGO_BAZA = require("@/assets/studio/baza-logo.webp"); // forest green on transparent

const SCHEDULE_PHOTOS = [PHOTO_RINGS, PHOTO_PLANK, PHOTO_REFORMER, PHOTO_TRIPLE];

// Palette — bone canvas, near-black ink, forest green as SIGNATURE not CTA.
const BG = "#F4EFE3";
const SURFACE = "#FFFFFF";
const SURFACE_2 = "#EBE5D5";
const INK = "#0F0F0D";
const INK_SOFT = "rgba(15,15,13,0.62)";
const INK_FAINT = "rgba(15,15,13,0.38)";
const HAIRLINE = "rgba(15,15,13,0.10)";
const ACCENT = "#2e5b42";
const ACCENT_LIGHT = "#9ED6B5"; // sage glow on dark photo overlays

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Stable photo for a session id, so the same class always shows the same photo.
function photoForSessionId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SCHEDULE_PHOTOS[h % SCHEDULE_PHOTOS.length];
}

// ────────────────────────────────────────────────────────────────────────
// Atoms

function CapsLabel({
  children,
  size = 11,
  color = INK,
  tracking = 2,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  tracking?: number;
}) {
  return (
    <Text
      style={{
        fontFamily: "AlbertSans-SemiBold",
        fontSize: size,
        color,
        letterSpacing: tracking,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function SectionRow({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingHorizontal: 20,
        marginBottom: 12,
      }}
    >
      <CapsLabel size={12} tracking={2.4}>
        {title}
      </CapsLabel>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text
            style={{
              fontFamily: "AlbertSans-Medium",
              fontSize: 12,
              color: INK_SOFT,
              textDecorationLine: "underline",
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BlackPill({
  label,
  onPress,
  fill = INK,
  textColor = "#FFFFFF",
  block = false,
}: {
  label: string;
  onPress: () => void;
  fill?: string;
  textColor?: string;
  block?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "#2A2A26" : fill,
        paddingHorizontal: 22,
        paddingVertical: 14,
        borderRadius: 4,
        alignSelf: block ? "stretch" : "flex-start",
        alignItems: "center",
      })}
    >
      <Text
        style={{
          fontFamily: "AlbertSans-SemiBold",
          fontSize: 12,
          color: textColor,
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Week strip — minimal, ink-on-bone with a single ink-filled today

function WeekStrip({
  selected,
  onSelect,
  sessionsByDay,
}: {
  selected: dayjs.Dayjs;
  onSelect: (d: dayjs.Dayjs) => void;
  sessionsByDay: Record<string, number>;
}) {
  const start = dayjs().startOf("day");
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: 20,
        gap: 6,
      }}
    >
      {days.map((d) => {
        const isSelected = d.isSame(selected, "day");
        const count = sessionsByDay[d.format("YYYY-MM-DD")] ?? 0;
        return (
          <Pressable
            key={d.toString()}
            onPress={() => onSelect(d)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: isSelected ? INK : "transparent",
              borderWidth: isSelected ? 0 : 1,
              borderColor: HAIRLINE,
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 10,
                color: isSelected ? "rgba(255,255,255,0.6)" : INK_FAINT,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {d.format("ddd")}
            </Text>
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 18,
                marginTop: 4,
                color: isSelected ? "#FFFFFF" : INK,
                letterSpacing: -0.3,
              }}
            >
              {d.format("D")}
            </Text>
            <View
              style={{
                marginTop: 6,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  count > 0
                    ? isSelected
                      ? "#FFFFFF"
                      : ACCENT
                    : "transparent",
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Hero — full-bleed photo card with glass info ribbon (Heartcore + Alo)

function NextClassHero({
  session,
  lang,
  onPress,
  onCancel,
  userName,
  greeting,
}: {
  session: {
    id: string;
    classTypeName: string;
    startsAt: Date | string;
    endsAt: Date | string;
    roomName: string | null;
    capacity: number;
    bookedCount: number;
  };
  lang: string;
  onPress: () => void;
  onCancel: () => void;
  userName: string;
  greeting: string;
}) {
  const { t } = useTranslation();
  const start = dayjs(session.startsAt);
  const end = dayjs(session.endsAt);
  const minsUntil = start.diff(dayjs(), "minute");
  const isWithinHour = minsUntil <= 60 && minsUntil >= 0;
  const isToday = start.isSame(dayjs(), "day");
  const isTomorrow = start.isSame(dayjs().add(1, "day"), "day");
  const dayLabel = isToday
    ? t("client.home.today").toUpperCase()
    : isTomorrow
      ? t("client.home.tomorrow").toUpperCase()
      : start.locale(lang).format("dddd, D MMM").toUpperCase();
  const spotsLeft = session.capacity - session.bookedCount;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: 8,
          overflow: "hidden",
          opacity: pressed ? 0.97 : 1,
        })}
      >
        <ImageBackground
          source={PHOTO_HERO}
          style={{ width: "100%", height: 340 }}
          resizeMode="cover"
        >
          {/* Top overlay — ink fade for status legibility */}
          <LinearGradient
            colors={["rgba(15,15,13,0.55)", "rgba(15,15,13,0)"]}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 160,
            }}
          />
          {/* Bottom overlay — deep ink so the info ribbon reads */}
          <LinearGradient
            colors={[
              "rgba(15,15,13,0)",
              "rgba(15,15,13,0.55)",
              "rgba(15,15,13,0.92)",
            ]}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 320,
            }}
          />

          {/* Top — greeting + status chip */}
          <View
            style={{
              padding: 20,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: ACCENT,
                }}
              />
              <Text
                style={{
                  fontFamily: "AlbertSans-SemiBold",
                  fontSize: 11,
                  color: "#FFFFFF",
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                }}
                numberOfLines={1}
              >
                {greeting}, {userName}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: isWithinHour
                  ? "#FFFFFF"
                  : "rgba(255,255,255,0.18)",
                borderWidth: isWithinHour ? 0 : 1,
                borderColor: "rgba(255,255,255,0.35)",
              }}
            >
              <Text
                style={{
                  fontFamily: "AlbertSans-SemiBold",
                  fontSize: 10,
                  color: isWithinHour ? INK : "#FFFFFF",
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {isWithinHour
                  ? t("client.home.startsInMinutes", { minutes: minsUntil })
                  : t("client.home.confirmed")}
              </Text>
            </View>
          </View>

          {/* Bottom — class info ribbon */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 20,
              gap: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 11,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: 1.6,
              }}
            >
              {dayLabel}  ·  {start.format("HH:mm")}–{end.format("HH:mm")}
            </Text>
            <Text
              style={{
                fontFamily: "AlbertSans-Bold",
                fontSize: 30,
                color: "#FFFFFF",
                letterSpacing: -0.6,
                lineHeight: 34,
              }}
              numberOfLines={2}
            >
              {session.classTypeName}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 2 }}>
              {session.roomName ? (
                <Text
                  style={{
                    fontFamily: "AlbertSans-Regular",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: 0.4,
                  }}
                >
                  {session.roomName}
                </Text>
              ) : null}
              <Text
                style={{
                  fontFamily: "AlbertSans-Regular",
                  fontSize: 12,
                  color: ACCENT === "#2e5b42" ? "#9ED6B5" : "rgba(255,255,255,0.7)",
                  letterSpacing: 0.4,
                }}
              >
                {spotsLeft === 1
                  ? t("client.home.spotLeft", { count: spotsLeft })
                  : t("client.home.spotsLeft", { count: spotsLeft })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <BlackPill
                label={
                  isWithinHour
                    ? t("client.home.checkIn")
                    : t("client.home.viewDetails")
                }
                onPress={onPress}
                fill="#FFFFFF"
                textColor={INK}
              />
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => ({
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.5)",
                  backgroundColor: pressed
                    ? "rgba(255,255,255,0.1)"
                    : "transparent",
                })}
              >
                <Text
                  style={{
                    fontFamily: "AlbertSans-SemiBold",
                    fontSize: 12,
                    color: "#FFFFFF",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                  }}
                >
                  {t("client.home.cancel")}
                </Text>
              </Pressable>
            </View>
          </View>
        </ImageBackground>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Schedule row — Heartcore-style with photo thumb + instructor avatar

function ScheduleRow({
  session,
  onPress,
}: {
  session: {
    id: string;
    classTypeName: string;
    startsAt: Date | string;
    endsAt: Date | string;
    roomName: string | null;
    availableSlots: number;
    capacity: number;
  };
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const start = dayjs(session.startsAt);
  const end = dayjs(session.endsAt);
  const full = session.availableSlots === 0;
  const photo = photoForSessionId(session.id);

  return (
    <Pressable onPress={onPress}>
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
            backgroundColor: SURFACE_2,
          }}
          resizeMode="cover"
        />

        {/* Body */}
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontFamily: "AlbertSans-SemiBold",
              fontSize: 11,
              color: INK_SOFT,
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
              color: INK,
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
              color: full ? INK_FAINT : ACCENT,
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

        {/* Action chevron-style label */}
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: 11,
            color: INK,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          {full ? t("client.home.join") : t("client.home.book")}
        </Text>
      </View>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Package — confident card with brand mark

function PackageCard({
  pkg,
  lang,
  onPress,
}: {
  pkg: ClientPackage;
  lang: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const total = pkg.packageType?.sessionCount ?? 0;
  const left = pkg.sessionsRemaining;
  const used = Math.max(0, total - left);
  const pct = total ? used / total : 0;
  const expires = dayjs(pkg.expiresAt);
  const daysLeft = expires.diff(dayjs(), "day");
  const expiringSoon = daysLeft <= 14;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          backgroundColor: ACCENT,
          borderRadius: 8,
          padding: 22,
          opacity: pressed ? 0.96 : 1,
          gap: 18,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View>
            <CapsLabel size={10} color="rgba(255,255,255,0.5)" tracking={2.2}>
              {t("client.home.onAccount")}
            </CapsLabel>
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 16,
                color: "#FFFFFF",
                marginTop: 8,
                letterSpacing: -0.2,
              }}
            >
              {pkg.packageType?.name ?? t("client.home.package")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}
            >
              <Text
                style={{
                  fontFamily: "AlbertSans-Bold",
                  fontSize: 40,
                  color: "#FFFFFF",
                  letterSpacing: -1,
                  lineHeight: 40,
                }}
              >
                {left}
              </Text>
              <Text
                style={{
                  fontFamily: "AlbertSans-Regular",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                / {total}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 9,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {t("client.home.sessionsRemaining")}
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 2,
            backgroundColor: "rgba(255,255,255,0.12)",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${Math.max(2, pct * 100)}%`,
              height: "100%",
              backgroundColor: "#FFFFFF",
            }}
          />
        </View>

        <Text
          style={{
            fontFamily: "AlbertSans-Regular",
            fontSize: 12,
            color: expiringSoon ? "#FFD79A" : "rgba(255,255,255,0.65)",
            letterSpacing: 0.2,
          }}
        >
          {expiringSoon
            ? t("client.home.expiresWithCountdown", {
                date: expires.locale(lang).format("D MMMM"),
                days: daysLeft,
              })
            : t("client.home.expiresOn", {
                date: expires.locale(lang).format("D MMMM"),
              })}
        </Text>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Note row — quiet, list-style with avatar

function NoteRow({
  note,
  lang,
  isLast,
}: {
  note: TrainerNote;
  lang: string;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const initial = (note.trainer?.fullName ?? "T").charAt(0).toUpperCase();
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          paddingVertical: 16,
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: INK,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "AlbertSans-SemiBold",
              fontSize: 13,
              color: "#FFFFFF",
            }}
          >
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "AlbertSans-SemiBold",
              fontSize: 11,
              color: INK_FAINT,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {note.trainer?.fullName ?? t("client.home.trainer")} ·{" "}
            {dayjs(note.createdAt).locale(lang).format("D MMM")}
          </Text>
          <Text
            style={{
              fontFamily: "AlbertSans-Regular",
              fontSize: 14,
              color: INK,
              lineHeight: 20,
            }}
            numberOfLines={3}
          >
            {note.note}
          </Text>
        </View>
      </View>
      {!isLast ? (
        <View
          style={{
            height: 1,
            backgroundColor: HAIRLINE,
            marginLeft: 68,
            marginRight: 20,
          }}
        />
      ) : null}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Screen

export default function HomeStudio() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const profileSheet = useProfileSheet();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState(dayjs().startOf("day"));
  // Just a small breathing buffer — the flat tab bar takes its own real
  // layout space, so the ScrollView is naturally clipped at it. No need
  // to reserve extra space above it.
  const bottomPad = 24;

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());
  const month = currentMonthKey();
  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) =>
      p.sessionsRemaining > 0 && new Date(p.expiresAt) > new Date(),
  );
  const notes = notesQuery.data?.notes ?? [];
  const sessions = availabilityQuery.data?.sessions ?? [];

  const userName = meQuery.data?.user.email?.split("@")[0] ?? "";
  const now = new Date();
  const upcoming = sessions
    .filter((s) => new Date(s.startsAt) > now)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const next = upcoming[0] ?? null;

  const sessionsByDay = sessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const dayKey = selectedDay.format("YYYY-MM-DD");
  const daySessions = sessions
    .filter((s) => dayjs(s.startsAt).format("YYYY-MM-DD") === dayKey)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
      queryClient.invalidateQueries({ queryKey: ["packages"] }),
      queryClient.invalidateQueries({ queryKey: ["trainerNotes"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);
    setRefreshing(false);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return t("client.home.greetingMorning");
    if (h < 17) return t("client.home.greetingAfternoon");
    return t("client.home.greetingEvening");
  })();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" />

      {/* Wordmark header — SKIMS-tight letterspacing, sits on bone */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: BG,
        }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left avatar — opens the profile sheet (theme + language + sign out) */}
          <Pressable
            onPress={profileSheet.open}
            hitSlop={8}
            android_ripple={null}
            className="active:opacity-80"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "AlbertSans-SemiBold",
                fontSize: 13,
                color: "#FFFFFF",
              }}
            >
              {(userName || "B").charAt(0).toUpperCase()}
            </Text>
          </Pressable>

          {/* Baza logo lockup — the actual brand mark (BAZA + PILATES STUDIO),
              forest green on transparent. Sized to fit the header band. */}
          <Image
            source={LOGO_BAZA}
            style={{ width: 110, height: 32 }}
            resizeMode="contain"
          />

          {/* Visual balance for the avatar */}
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: bottomPad,
          gap: 24,
          backgroundColor: BG,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={INK}
            colors={[INK]}
          />
        }
      >
        {/* Hero */}
        {next ? (
          <NextClassHero
            session={next}
            lang={lang}
            userName={userName || "there"}
            greeting={greeting}
            onPress={() => router.push("/(client)/calendar")}
            onCancel={() => router.push("/(client)/calendar")}
          />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <View
              style={{
                width: "100%",
                height: 320,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <ImageBackground
                source={PHOTO_HERO}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              >
                {/* Top fade — anchors the greeting against the bright bone curtains */}
                <LinearGradient
                  colors={["rgba(15,15,13,0.65)", "rgba(15,15,13,0)"]}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 180,
                  }}
                />
                {/* Bottom fade — for the CTA block */}
                <LinearGradient
                  colors={[
                    "rgba(15,15,13,0)",
                    "rgba(15,15,13,0.55)",
                    "rgba(15,15,13,0.92)",
                  ]}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 320,
                  }}
                />

                {/* Greeting at the very top — bright, anchored, with green dot */}
                <View
                  style={{
                    padding: 20,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: ACCENT,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: "AlbertSans-SemiBold",
                      fontSize: 11,
                      color: "#FFFFFF",
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                    }}
                  >
                    {t("client.home.helloName", { name: userName || "" })}
                  </Text>
                </View>

                {/* Bottom block — headline + CTA */}
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: 22,
                    gap: 16,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "AlbertSans-SemiBold",
                      fontSize: 11,
                      color: ACCENT_LIGHT,
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                    }}
                  >
                    {t("client.home.noUpcomingSession")}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "AlbertSans-Bold",
                      fontSize: 30,
                      color: "#FFFFFF",
                      letterSpacing: -0.6,
                      lineHeight: 34,
                    }}
                  >
                    {t("client.home.readyForNext")}
                  </Text>
                  <View style={{ flexDirection: "row", marginTop: 4 }}>
                    <BlackPill
                      label={t("client.home.browseSchedule")}
                      onPress={() => router.push("/(client)/calendar")}
                      fill="#FFFFFF"
                      textColor={INK}
                    />
                  </View>
                </View>
              </ImageBackground>
            </View>
          </View>
        )}

        {/* This week */}
        <View>
          <SectionRow
            title={t("client.home.thisWeek")}
            action={{
              label: t("client.home.seeAll"),
              onPress: () => router.push("/(client)/calendar"),
            }}
          />
          <WeekStrip
            selected={selectedDay}
            onSelect={setSelectedDay}
            sessionsByDay={sessionsByDay}
          />
          <View style={{ height: 18 }} />
          {daySessions.length === 0 ? (
            <View style={{ paddingHorizontal: 20 }}>
              <View
                style={{
                  paddingVertical: 22,
                  paddingHorizontal: 18,
                  borderRadius: 4,
                  backgroundColor: SURFACE_2,
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "AlbertSans-Regular",
                    fontSize: 13,
                    color: INK_SOFT,
                    lineHeight: 18,
                  }}
                >
                  {t("client.home.noClassesOnDay", {
                    day: selectedDay.locale(lang).format("dddd, D MMMM"),
                  })}
                  {"\n"}
                  {t("client.home.tryAnotherDay")}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: SURFACE,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {daySessions.slice(0, 5).map((s, i) => (
                <View key={s.id}>
                  <View style={{ marginHorizontal: -4 }}>
                    <ScheduleRow
                      session={s}
                      onPress={() => router.push("/(client)/calendar")}
                    />
                  </View>
                  {i < Math.min(daySessions.length, 5) - 1 ? (
                    <View
                      style={{
                        height: 1,
                        backgroundColor: HAIRLINE,
                        marginLeft: 20 + 64 + 14,
                        marginRight: 20,
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Package */}
        {activePackage ? (
          <View>
            <SectionRow
              title={t("client.home.yourPackage")}
              action={{
                label: t("client.home.manage"),
                onPress: () => router.push("/(client)/profile"),
              }}
            />
            <PackageCard
              pkg={activePackage}
              lang={lang}
              onPress={() => router.push("/(client)/profile")}
            />
          </View>
        ) : null}

        {/* Trainer notes */}
        {notes.length > 0 ? (
          <View>
            <SectionRow title={t("client.home.fromYourTrainer")} />
            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: SURFACE,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {notes.slice(0, 3).map((note: TrainerNote, i, arr) => (
                <View key={note.id} style={{ marginHorizontal: -4 }}>
                  <NoteRow
                    note={note}
                    lang={lang}
                    isLast={i === arr.length - 1}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

    </View>
  );
}
