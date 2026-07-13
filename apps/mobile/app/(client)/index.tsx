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
import { now } from "@/lib/now";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AppHeader } from "@/components/ui/app-header";
import { StudioWeekStrip } from "@/components/ui/studio";
import { ScheduleRow } from "@/components/ui/schedule-row";
import { EmptyState } from "@/components/ui/states";
import {
  useBookingSheet,
  ClientBookingSheet,
} from "@/components/client/use-booking-sheet";
import { useThemeTokens } from "@/components/ui/tokens";

dayjs.extend(relativeTime);

// Studio photography (from baza-landing/public/optimized/gal/)
const PHOTO_HERO = require("@/assets/studio/group.webp");      // BAZA neon, 4 women on reformers

// Theme-stable values that go OVER photographs — these are intentionally
// hard-coded because they sit on top of an image and must read regardless
// of theme.
const ACCENT_LIGHT = "#9ED6B5"; // sage glow used on dark photo overlays

function currentMonthKey() {
  const today = now();
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
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
          style={{ width: "100%", height: 260 }}
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
              height: 110,
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
              height: 200,
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
            {/* Only the time-sensitive "starts in X min" chip is shown. The
                idle "POTVRĐENO" badge was redundant (the hero already implies
                the next booked class) and collided with long names, so it's
                dropped — letting the greeting use the full width. */}
            {isWithinHour ? (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text
                  style={{
                    fontFamily: "AlbertSans-SemiBold",
                    fontSize: 10,
                    color: "#0F0F0D",
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                  }}
                >
                  {t("client.home.startsInMinutes", { minutes: minsUntil })}
                </Text>
              </View>
            ) : null}
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
                fontSize: 12,
                color: "#FFFFFF",
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
            {/* Spots-left is intentionally omitted here — the hero is the
                user's already-booked next class, so availability is noise.
                Only the room is shown. */}
            {session.roomName ? (
              <View style={{ flexDirection: "row", marginTop: 2 }}>
                <Text
                  style={{
                    fontFamily: "AlbertSans-Regular",
                    fontSize: 13,
                    color: "#FFFFFF",
                    letterSpacing: 0.4,
                  }}
                >
                  {session.roomName}
                </Text>
              </View>
            ) : null}
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
  // "Left to book" — remaining credits minus sessions already held (future
  // bookings + waitlist seats), computed server-side. Raw sessionsRemaining
  // is consumed-at-attendance credits, which clients misread as bookable.
  const left = pkg.bookable ?? pkg.sessionsRemaining;
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
              {t("client.home.bookableLabel")}
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
// Package — renewal state: the client HAD a package but it lapsed. The card
// stays on the home screen (instead of silently disappearing) and tells them
// exactly how to get back on the schedule.

function RenewalCard({ pkg }: { pkg: ClientPackage }) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View
        testID="home-renewal-card"
        style={{
          backgroundColor: tokens.surface,
          borderRadius: 8,
          padding: 22,
          gap: 10,
        }}
      >
        <CapsLabel size={10} color="#a17d3a" tracking={2.2}>
          {t("client.renewal.homeTitle")}
        </CapsLabel>
        <Text
          style={{
            fontFamily: "AlbertSans-SemiBold",
            fontSize: 16,
            color: tokens.foreground,
            letterSpacing: -0.2,
          }}
        >
          {pkg.packageType?.name ?? t("client.home.package")}
        </Text>
        <Text
          style={{
            fontFamily: "AlbertSans-Regular",
            fontSize: 13,
            lineHeight: 19,
            color: tokens.muted,
            letterSpacing: 0.1,
          }}
        >
          {t("client.renewal.message")}
        </Text>
      </View>
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

  // Open the calendar tab focused on a specific day. Passing the session's /
  // selected day's date means tapping a Friday class lands on Friday, not on
  // whatever day the calendar was last left on.
  function goToCalendar(date?: Date | string) {
    const d = date ? dayjs(date).format("YYYY-MM-DD") : undefined;
    router.push(
      d
        ? { pathname: "/(client)/calendar", params: { date: d } }
        : "/(client)/calendar",
    );
  }
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
  // Same booking sheet as the calendar — tapping a session row (or the hero
  // buttons) books/cancels inline instead of bouncing to the calendar tab.
  const booking = useBookingSheet();

  const packages = packagesQuery.data?.packages ?? [];
  const activePackage = packages.find(
    (p: ClientPackage) =>
      p.sessionsRemaining > 0 && new Date(p.expiresAt) > now(),
  );
  // No active package but a purchase history → renewal state. The most
  // recently expiring package names what the client would be renewing.
  const lastLapsedPackage = activePackage
    ? null
    : ([...packages].sort(
        (a: ClientPackage, b: ClientPackage) =>
          new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
      )[0] ?? null);
  const sessions = availabilityQuery.data?.sessions ?? [];

  // First name only. Fall back to the email local-part if the profile has no
  // name yet.
  const userName =
    meQuery.data?.user.firstName ||
    meQuery.data?.user.email?.split("@")[0] ||
    "";
  const nowDate = now();
  // The hero is the client's NEXT BOOKED class (it carries DETALJI/OTKAŽI), so
  // it must filter to sessions the client actually reserved — not just the next
  // bookable one. No booking → the "ready for next" empty state shows instead.
  const upcoming = sessions
    .filter((s) => s.isBookedByMe && new Date(s.startsAt) > nowDate)
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
      queryClient.invalidateQueries({ queryKey: authQueries.all }),
      queryClient.invalidateQueries({ queryKey: packagesQueries.all }),
      queryClient.invalidateQueries({ queryKey: sessionsQueries.all }),
    ]);
    setRefreshing(false);
  }

  const greeting = (() => {
    const h = now().getHours();
    // Before 5am it's still night — "Dobro veče", not morning. Morning runs
    // 5:00–10:59, "Dobar dan" until 18:00 (17:xx still reads daytime), then
    // evening.
    if (h < 5) return t("client.home.greetingEvening");
    if (h < 11) return t("client.home.greetingMorning");
    if (h < 18) return t("client.home.greetingAfternoon");
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
            onPress={() => booking.open(next, "view")}
            onCancel={() => booking.open(next, "cancel")}
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

        {/* Package — above the week list: a client's own balance is the
            first thing they want to see, before browsing the schedule. */}
        {activePackage ? (
          <View>
            <SectionRow title={t("client.home.yourPackage")} />
            <PackageCard
              pkg={activePackage}
              lang={lang}
              onPress={() => router.push("/(client)/profile")}
            />
          </View>
        ) : lastLapsedPackage ? (
          <View>
            <SectionRow title={t("client.home.yourPackage")} />
            <RenewalCard pkg={lastLapsedPackage} />
          </View>
        ) : null}

        {/* This week */}
        <View>
          <SectionRow
            title={t("client.home.thisWeek")}
            action={{
              label: t("client.home.seeAll"),
              onPress: () => goToCalendar(dayKey),
            }}
          />
          <StudioWeekStrip
            selected={selectedDay}
            onSelect={setSelectedDay}
            sessionsByDay={sessionsByDay}
          />
          <View style={{ height: 18 }} />
          {daySessions.length === 0 ? (
            <View style={{ paddingHorizontal: 16 }}>
              <EmptyState
                title={
                  selectedDay.isSame(dayjs(), "day")
                    ? t("client.home.noClassesToday")
                    : t("client.home.noClassesThisDay")
                }
                description={t("client.home.tryAnotherDay")}
              />
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
                      onPress={() => booking.open(s)}
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
      </ScrollView>

      <ClientBookingSheet controller={booking} sessions={sessions} />
    </View>
  );
}
