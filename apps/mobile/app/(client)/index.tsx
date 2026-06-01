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
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AppHeader } from "@/components/ui/app-header";
import { StudioWeekStrip } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";

dayjs.extend(relativeTime);

// Studio photography (from baza-landing/public/optimized/gal/)
const PHOTO_HERO = require("@/assets/studio/group.webp");      // BAZA neon, 4 women on reformers
const PHOTO_RINGS = require("@/assets/studio/rings.webp");
const PHOTO_PLANK = require("@/assets/studio/plank.webp");
const PHOTO_TRIPLE = require("@/assets/studio/triple.webp");
const PHOTO_REFORMER = require("@/assets/studio/reformer-1.webp");

const SCHEDULE_PHOTOS = [PHOTO_RINGS, PHOTO_PLANK, PHOTO_REFORMER, PHOTO_TRIPLE];

// Theme-stable values that go OVER photographs — these are intentionally
// hard-coded because they sit on top of an image and must read regardless
// of theme.
const ACCENT_LIGHT = "#9ED6B5"; // sage glow used on dark photo overlays

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
  color,
  tracking = 2,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  tracking?: number;
}) {
  const tokens = useThemeTokens();
  const resolved = color ?? tokens.foreground;
  return (
    <Text
      style={{
        fontFamily: "AlbertSans-SemiBold",
        fontSize: size,
        color: resolved,
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
  const tokens = useThemeTokens();
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
              color: tokens.muted,
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

/**
 * Local pill — dims opacity on press instead of swapping background color
 * so a white pill stays white-ish (not muddy grey-brown) when held.
 */
function BlackPill({
  label,
  onPress,
  fill,
  textColor,
  block = false,
}: {
  label: string;
  onPress: () => void;
  fill?: string;
  textColor?: string;
  block?: boolean;
}) {
  const tokens = useThemeTokens();
  const resolvedFill = fill ?? tokens.foreground;
  const resolvedText = textColor ?? tokens.background;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={null}
      style={({ pressed }) => ({
        backgroundColor: resolvedFill,
        opacity: pressed ? 0.85 : 1,
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
          color: resolvedText,
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
                  backgroundColor: "#2e5b42",
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
                  color: isWithinHour ? "#0F0F0D" : "#FFFFFF",
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
                  color: ACCENT_LIGHT,
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
                textColor="#0F0F0D"
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
    isBookedByMe?: boolean;
  };
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

        {/* Action chevron-style label. When the client already holds an
            active booking on this session, show a positive "REZERVISANO"
            label in the accent color instead of an action verb — the hero
            card above already exposes the cancel CTA, so the row's only
            job here is to confirm state. */}
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
          backgroundColor: "#2e5b42",
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
                testID="package-sessions-remaining"
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
// Screen

export default function HomeStudio() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState(dayjs().startOf("day"));
  // Just a small breathing buffer — the flat tab bar takes its own real
  // layout space, so the ScrollView is naturally clipped at it. No need
  // to reserve extra space above it.
  const bottomPad = 24;

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const month = currentMonthKey();
  const availabilityQuery = useQuery(
    sessionsQueries.availabilityByMonth(month),
  );

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) =>
      p.sessionsRemaining > 0 && new Date(p.expiresAt) > new Date(),
  );
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
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      {/* Shared AppHeader — same logo + UserAvatar + StatusBar handling
          as every other tab. Single source of truth so headers don't
          drift between screens. */}
      <AppHeader leftSlot={<UserAvatar />} />

      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: bottomPad,
          gap: 24,
          backgroundColor: tokens.background,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.foreground}
            colors={[tokens.foreground]}
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
                      backgroundColor: "#2e5b42",
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
                      textColor="#0F0F0D"
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
          <StudioWeekStrip
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
                  backgroundColor: tokens.surface2,
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "AlbertSans-Regular",
                    fontSize: 13,
                    color: tokens.muted,
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
                backgroundColor: tokens.surface,
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
                        backgroundColor: tokens.glassBorder,
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
            <SectionRow title={t("client.home.yourPackage")} />
            <PackageCard
              pkg={activePackage}
              lang={lang}
              onPress={() => router.push("/(client)/profile")}
            />
          </View>
        ) : null}
      </ScrollView>

    </View>
  );
}
