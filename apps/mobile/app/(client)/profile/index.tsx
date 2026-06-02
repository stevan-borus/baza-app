/**
 * Client Profile (tab) — editorial restraint.
 *
 * Profile is a "this is yours" settings surface, not a discovery surface.
 * Where the home tab leans on photography, the profile leans on tight
 * typography + hairlines. The avatar IS the only image that belongs.
 *
 * Layout:
 *   AppHeader (Baza logo + UserAvatar)
 *   ScrollView
 *   ├─ Hero: large centered avatar (camera badge), name, email,
 *   │   "MEMBER SINCE" caps tag
 *   ├─ MOJI PAKETI: surface cards stacked
 *   ├─ ISTORIJA TRENINGA: hairline link row → past-bookings list
 *   └─ FOTOGRAFIJE / ZDRAVSTVENI PODACI / PRAVNA DOKUMENTA
 *
 * Settings + Sign out live in the ProfileSheet (header avatar tap).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useLocalAvatar } from "@/lib/use-local-avatar";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { SectionRow, CapsLabel } from "@/components/ui/studio";
import { displayName } from "@baza/types";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { ProfilePersonalDataSections } from "@/components/profile/profile-personal-data-sections";

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

  const packages = packagesQuery.data?.packages ?? [];
  const userEmail = meQuery.data?.user.email ?? "";
  const userName = displayName(meQuery.data?.user);
  const initials = userEmail ? getInitials(userEmail) : "?";

  // "Member since" — the User row's createdAt. The previous derivation
  // proxied this from the oldest trainer note, which silently fell back
  // to "current year" for any client without notes; once we stopped
  // surfacing notes to clients this proxy had to go anyway.
  const memberSinceYear = meQuery.data?.user.createdAt
    ? new Date(meQuery.data.user.createdAt).getFullYear()
    : new Date().getFullYear();

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth"] }),
      queryClient.invalidateQueries({ queryKey: ["packages"] }),
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
        {/* ── Hero ─ centered editorial; avatar IS the only image ─── */}
        <MotiView
          from={{ opacity: 0, translateY: 6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 0 }}
        >
          <View className="items-center pt-6 pb-2 gap-4">
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
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                    }}
                  />
                  <View
                    className="absolute right-1 bottom-1 w-8 h-8 rounded-full bg-foreground items-center justify-center"
                    style={{ borderWidth: 2, borderColor: tokens.background }}
                  >
                    <Icon name="camera" size={14} color={tokens.background} />
                  </View>
                </View>
              ) : (
                <View
                  className="relative w-[120px] h-[120px] rounded-full bg-accent-soft items-center justify-center"
                >
                  <Text
                    className="font-body-bold text-accent"
                    style={{ fontSize: 36, letterSpacing: 1 }}
                  >
                    {initials}
                  </Text>
                  <View
                    className="absolute right-1 bottom-1 w-8 h-8 rounded-full bg-foreground items-center justify-center"
                    style={{ borderWidth: 2, borderColor: tokens.background }}
                  >
                    <Icon name="camera" size={14} color={tokens.background} />
                  </View>
                </View>
              )}
            </Pressable>

            <View className="items-center gap-1">
              <Text
                className="font-body-bold text-foreground text-center"
                style={{ fontSize: 26, letterSpacing: -0.5, textTransform: "capitalize" }}
                numberOfLines={1}
              >
                {userName}
              </Text>
              <Text
                className="text-muted text-[12px] text-center"
                numberOfLines={1}
              >
                {userEmail}
              </Text>
              <View className="mt-2">
                <CapsLabel size={10} tracking={1.6} className="text-faint">
                  {t("client.profileTab.memberSince", { year: memberSinceYear })}
                </CapsLabel>
              </View>
            </View>
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
            <View className="mx-4 border-t border-glass-border">
              <View className="flex-row items-center justify-between py-4">
                <Text
                  className="font-body-medium text-foreground"
                  style={{ fontSize: 15, letterSpacing: -0.1 }}
                >
                  {t("client.package.noActive")}
                </Text>
                <Text className="text-faint text-[13px]">—</Text>
              </View>
            </View>
          ) : null}
          <View className="gap-3 px-4">
            {packages.map((pkg: ClientPackage) => {
              const total = pkg.packageType?.sessionCount ?? 0;
              const progress = getPackageProgress(pkg);
              const expires = new Date(pkg.expiresAt);
              const expired =
                pkg.sessionsRemaining <= 0 || expires < new Date();
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

        {/* ── ISTORIJA TRENINGA — hairline list row, no card chrome ── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 260 }}
        >
          <SectionRow title={t("client.profileTab.trainingHistory")} />
          <View className="mx-4 border-t border-glass-border">
            <Pressable
              testID="client-profile-history-row"
              onPress={() => router.push("/(client)/profile/history")}
              android_ripple={null}
              className="flex-row items-center justify-between py-4 active:opacity-60"
            >
              <Text
                className="font-body-medium text-foreground"
                style={{ fontSize: 15, letterSpacing: -0.1 }}
              >
                {t("client.profileTab.viewHistory")}
              </Text>
              <Icon name="chevron-right" size={16} color={tokens.faint} />
            </Pressable>
          </View>
        </MotiView>

        {/* ── FOTOGRAFIJE / ZDRAVSTVENI PODACI / PRAVNA DOKUMENTA ── */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 340 }}
        >
          <ProfilePersonalDataSections />
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
