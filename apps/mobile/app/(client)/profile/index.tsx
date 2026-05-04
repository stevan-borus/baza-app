/**
 * Client Profile (tab) — Studio look, magazine-cover hero.
 *
 * Layout:
 *   AppHeader (Baza logo + UserAvatar)
 *   ScrollView
 *   ├─ Cover: full-bleed studio photo with overlaid avatar + name + "MEMBER SINCE"
 *   ├─ Editorial stat strip: Fraunces numerals, hairline-separated columns,
 *   │   em-dash for empty values
 *   ├─ MOJI PAKETI section: white surface card per package with ink hairline,
 *   │   Fraunces sessions-remaining numeral, sage progress bar
 *   └─ ISTORIJA TRENINGA: schedule-row-style link → push to history.tsx
 *
 * Settings + Sign out live in the ProfileSheet (header avatar tap).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalAvatar } from "@/lib/use-local-avatar";
import Feather from "@expo/vector-icons/Feather";
import { MotiView } from "@/components/ui/styled";
import { SectionRow, CapsLabel } from "@/components/ui/studio";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries } from "@/lib/queries/trainer-notes-queries-factory";

const COVER_PHOTO = require("@/assets/studio/triple.webp");

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(email: string): string {
  const prefix = email.split("@")[0] ?? "";
  const parts = prefix.split(/[._-]/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return prefix.slice(0, 2).toUpperCase();
}

function getPackageProgress(pkg: ClientPackage): number {
  const total = pkg.packageType?.sessionCount ?? 0;
  if (total <= 0) return 0;
  return pkg.sessionsRemaining / total;
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ClientProfile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const queryClient = useQueryClient();
  const tokens = useThemeTokens();
  const dateLocale = getDateLocale();
  const bottomPad = useTabBarBottomPadding(24);
  const [refreshing, setRefreshing] = useState(false);
  const { avatarUri, setAvatarUri } = useLocalAvatar();

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());

  const packages = packagesQuery.data?.packages ?? [];
  const notes = notesQuery.data?.notes ?? [];
  const userEmail = meQuery.data?.user.email ?? "";
  const userName = userEmail.split("@")[0];
  const initials = userEmail ? getInitials(userEmail) : "?";

  const totalNotes = notes.length;
  const now = new Date();
  const thisMonthBookings = notes.filter((n) => {
    const d = new Date(n.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const activePackages = packages.filter(
    (p) => p.sessionsRemaining > 0 && new Date(p.expiresAt) >= now,
  ).length;

  // "Member since" — derive from the oldest known note (proxy for first
  // session). Falls back to current year when there's no signal yet.
  const memberSinceYear = (() => {
    if (notes.length === 0) return new Date().getFullYear();
    const earliest = notes.reduce((min, n) => {
      const t = new Date(n.createdAt).getTime();
      return t < min ? t : min;
    }, Number.POSITIVE_INFINITY);
    return new Date(earliest).getFullYear();
  })();

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
      queryClient.invalidateQueries({ queryKey: ["packages"] }),
      queryClient.invalidateQueries({ queryKey: ["trainerNotes"] }),
    ]);
    setRefreshing(false);
  }

  async function handlePickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    setAvatarUri(uri);
  }

  return (
    <ScreenContainerRaw title={t("tabs.profile")}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: bottomPad,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
      >
        {/* ── Cover ────────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 450, delay: 0 }}
        >
          <View
            className="mx-4 mt-3 rounded-lg overflow-hidden"
            style={{ height: 320 }}
          >
            <ImageBackground
              source={COVER_PHOTO}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            >
              {/* Top fade — anchors the "MEMBER SINCE" tag */}
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
              {/* Bottom fade — anchors avatar + name */}
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
                  height: 240,
                }}
              />

              {/* Top: brass tag */}
              <View className="px-5 pt-5 flex-row items-center gap-2">
                <View
                  className="rounded-full bg-accent"
                  style={{ width: 6, height: 6 }}
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
                  {t("client.profileTab.memberSince", {
                    year: memberSinceYear,
                  })}
                </Text>
              </View>

              {/* Bottom: avatar + name + email */}
              <View
                className="absolute left-0 right-0 bottom-0 p-5 flex-row items-end gap-4"
              >
                <Pressable
                  onPress={handlePickAvatar}
                  hitSlop={8}
                  android_ripple={null}
                  className="active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel={t("client.profileTab.changePhoto")}
                >
                  {avatarUri ? (
                    <View className="relative">
                      <Image
                        source={{ uri: avatarUri }}
                        style={{
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                          borderWidth: 2,
                          borderColor: "#FFFFFF",
                        }}
                      />
                      <View
                        className="absolute right-0 bottom-0 w-7 h-7 rounded-full bg-accent items-center justify-center"
                        style={{ borderWidth: 2, borderColor: "#FFFFFF" }}
                      >
                        <Feather name="camera" size={13} color="#FFFFFF" />
                      </View>
                    </View>
                  ) : (
                    <View
                      className="relative w-[76px] h-[76px] rounded-full bg-accent items-center justify-center"
                      style={{ borderWidth: 2, borderColor: "#FFFFFF" }}
                    >
                      <Text
                        style={{
                          fontFamily: "AlbertSans-Bold",
                          fontSize: 28,
                          color: "#FFFFFF",
                          letterSpacing: 1,
                        }}
                      >
                        {initials}
                      </Text>
                      <View
                        className="absolute right-0 bottom-0 w-7 h-7 rounded-full bg-foreground items-center justify-center"
                        style={{ borderWidth: 2, borderColor: "#FFFFFF" }}
                      >
                        <Feather name="camera" size={13} color="#FFFFFF" />
                      </View>
                    </View>
                  )}
                </Pressable>

                <View className="flex-1 pb-1">
                  <Text
                    style={{
                      fontFamily: "AlbertSans-Bold",
                      fontSize: 26,
                      color: "#FFFFFF",
                      letterSpacing: -0.6,
                      textTransform: "capitalize",
                    }}
                    numberOfLines={1}
                  >
                    {userName}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "AlbertSans-Regular",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {userEmail}
                  </Text>
                </View>
              </View>
            </ImageBackground>
          </View>
        </MotiView>

        {/* ── Editorial stat strip ─────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 120 }}
        >
          <View className="mx-4 flex-row">
            <StatColumn
              label={t("client.profileTab.totalNotes")}
              value={totalNotes}
              loading={notesQuery.isLoading}
            />
            <View
              className="bg-glass-border"
              style={{ width: 1, marginVertical: 10 }}
            />
            <StatColumn
              label={t("client.profileTab.thisMonth")}
              value={thisMonthBookings}
              loading={notesQuery.isLoading}
            />
            <View
              className="bg-glass-border"
              style={{ width: 1, marginVertical: 10 }}
            />
            <StatColumn
              label={t("client.profileTab.activePkgs")}
              value={activePackages}
              loading={packagesQuery.isLoading}
              accent
            />
          </View>
        </MotiView>

        {/* ── MOJI PAKETI ──────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 200 }}
        >
          <SectionRow title={t("client.profileTab.myPackages")} />
          {packagesQuery.isError ? (
            <View className="mx-4 bg-danger-soft rounded-lg px-4 py-3">
              <Text className="text-danger text-sm font-body-medium">
                {t("client.package.error")}
              </Text>
            </View>
          ) : null}
          {packages.length === 0 && !packagesQuery.isLoading ? (
            <View className="mx-4 px-4 py-5 border-t border-b border-glass-border">
              <Text
                style={{
                  fontFamily: "AlbertSans-Regular",
                  fontSize: 13,
                  color: tokens.muted,
                  fontStyle: "italic",
                }}
              >
                {t("client.package.noActive")}
              </Text>
            </View>
          ) : null}
          <View className="gap-3 px-4">
            {packages.map((pkg: ClientPackage) => {
              const total = pkg.packageType?.sessionCount ?? 0;
              const progress = getPackageProgress(pkg);
              const expires = new Date(pkg.expiresAt);
              const expired = pkg.sessionsRemaining <= 0 || expires < now;
              return (
                <View key={pkg.id} className="bg-surface rounded-lg p-4 gap-3">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3 gap-1">
                      <CapsLabel
                        size={10}
                        tracking={1.6}
                        className={expired ? "text-faint" : "text-accent"}
                      >
                        {expired
                          ? t("client.profileTab.expired")
                          : t("client.package.active")}
                      </CapsLabel>
                      <Text
                        className="font-body-semibold text-foreground"
                        style={{ fontSize: 17, letterSpacing: -0.3, marginTop: 2 }}
                        numberOfLines={1}
                      >
                        {pkg.packageType?.name ?? t("client.package.packageName")}
                      </Text>
                    </View>
                    <View className="flex-row items-baseline">
                      <Text
                        className="font-body-bold text-foreground"
                        style={{
                          fontSize: 32,
                          letterSpacing: -1,
                          lineHeight: 32,
                        }}
                      >
                        {pkg.sessionsRemaining}
                      </Text>
                      <Text className="text-muted text-[13px] ml-1">
                        / {total > 0 ? total : "—"}
                      </Text>
                    </View>
                  </View>
                  <View
                    className="bg-glass-strong rounded-full overflow-hidden"
                    style={{ height: 3 }}
                  >
                    <View
                      className="bg-accent h-full"
                      style={{ width: `${Math.max(2, progress * 100)}%` }}
                    />
                  </View>
                  <Text className="text-muted text-[12px]">
                    {t("client.profileTab.expires", {
                      date: expires.toLocaleDateString(dateLocale),
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        </MotiView>

        {/* ── ISTORIJA TRENINGA — schedule-row style ─────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 280 }}
        >
          <SectionRow title={t("client.profileTab.trainingHistory")} />
          <Pressable
            onPress={() => router.push("/(client)/profile/history")}
            android_ripple={null}
            className="mx-4 bg-surface rounded-lg flex-row items-center px-4 py-3 gap-3 active:opacity-80"
          >
            <View
              className="rounded-md bg-accent-soft items-center justify-center"
              style={{ width: 56, height: 56 }}
            >
              <Feather name="bookmark" size={20} color={tokens.accent} />
            </View>
            <View className="flex-1 gap-1">
              <Text
                style={{
                  fontFamily: "AlbertSans-SemiBold",
                  fontSize: 11,
                  color: tokens.muted,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {t("client.profileTab.trainingHistory")}
              </Text>
              <Text
                className="font-body-semibold text-foreground"
                style={{ fontSize: 16, letterSpacing: -0.2 }}
              >
                {totalNotes === 0
                  ? t("client.history.noNotes")
                  : t("client.profileTab.notesCount", {
                      count: totalNotes,
                      defaultValue: `${totalNotes} entries`,
                    })}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.faint} />
          </Pressable>
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}

// ─── stat column ─────────────────────────────────────────────────────────────

function StatColumn({
  label,
  value,
  loading,
  accent = false,
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: boolean;
}) {
  // Empty data renders an em-dash instead of an aggressive zero — keeps
  // the strip elegant when the user is brand new.
  const display = loading ? "…" : value === 0 ? "—" : String(value);
  return (
    <View className="flex-1 items-center py-4 px-2 gap-1.5">
      <Text
        style={{
          fontFamily: "AlbertSans-SemiBold",
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
        className={accent ? "text-accent" : "text-muted"}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "AlbertSans-Bold",
          fontSize: 26,
          letterSpacing: -0.6,
          lineHeight: 30,
        }}
        className={accent ? "text-accent" : "text-foreground"}
      >
        {display}
      </Text>
    </View>
  );
}
