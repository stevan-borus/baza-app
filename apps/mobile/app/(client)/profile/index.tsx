/**
 * Client Profile (tab) — summary view.
 *
 * Layout:
 *   AppHeader (Baza logo + back? no, this IS a tab root)
 *   ScrollView (own height; not capped by ScreenContainer body padding)
 *   ├─ Hero: avatar (tap to upload), name, email
 *   ├─ Stat tiles: total sessions / this month / active packages
 *   ├─ My Packages
 *   └─ Training history (link row → push to history.tsx)
 *
 * Settings (theme + language) and Sign out live in the ProfileSheet
 * (header-avatar tap), not here.
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
import { useLocalAvatar } from "@/lib/use-local-avatar";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionLabel } from "@/components/ui/typography";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries } from "@/lib/queries/trainer-notes-queries-factory";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(email: string): string {
  const prefix = email.split("@")[0] ?? "";
  const parts = prefix.split(/[._-]/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return prefix.slice(0, 2).toUpperCase();
}

function getPackageStatus(pkg: ClientPackage): "success" | "warning" | "danger" {
  if (pkg.sessionsRemaining <= 0) return "danger";
  if (new Date(pkg.expiresAt) < new Date()) return "danger";
  return "success";
}

function getPackageStatusLabel(pkg: ClientPackage, t: (key: string) => string): string {
  if (new Date(pkg.expiresAt) < new Date()) return t("client.profileTab.expired");
  if (pkg.sessionsRemaining <= 0) return t("client.profileTab.expired");
  return t("client.package.active");
}

function getPackageProgress(pkg: ClientPackage): number {
  const total = pkg.packageType?.sessionCount ?? 0;
  if (total <= 0) return 0;
  return pkg.sessionsRemaining / total;
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ClientProfile() {
  const { t } = useTranslation();
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
    // Lazy-import so a missing native module (dev client built before
    // expo-image-picker was added) doesn't crash the whole screen at
    // import time. If the picker isn't available we just no-op the tap.
    let ImagePicker: typeof import("expo-image-picker");
    try {
      ImagePicker = await import("expo-image-picker");
    } catch {
      return;
    }
    try {
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
    } catch {
      // Native module missing or runtime error — no-op so the rest of
      // the screen stays functional.
    }
  }

  return (
    <ScreenContainerRaw title={t("tabs.profile")}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: bottomPad,
          gap: 24,
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
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 0 }}
        >
          <View className="items-center gap-3 pb-2">
            <Pressable
              onPress={handlePickAvatar}
              hitSlop={8}
              android_ripple={null}
              className="active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={t("client.profileTab.changePhoto", {
                defaultValue: "Change profile photo",
              })}
            >
              {avatarUri ? (
                <View className="relative">
                  <Image
                    source={{ uri: avatarUri }}
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                    }}
                  />
                  <View
                    className="absolute right-0 bottom-0 w-7 h-7 rounded-full bg-foreground items-center justify-center"
                    style={{ borderWidth: 2, borderColor: tokens.background }}
                  >
                    <Feather name="camera" size={13} color={tokens.background} />
                  </View>
                </View>
              ) : (
                <View className="w-24 h-24 rounded-full bg-accent-soft items-center justify-center relative">
                  <Text
                    className="text-accent font-body-bold"
                    style={{ fontSize: 32, letterSpacing: 1 }}
                  >
                    {initials}
                  </Text>
                  <View
                    className="absolute right-0 bottom-0 w-7 h-7 rounded-full bg-foreground items-center justify-center"
                    style={{ borderWidth: 2, borderColor: tokens.background }}
                  >
                    <Feather name="camera" size={13} color={tokens.background} />
                  </View>
                </View>
              )}
            </Pressable>

            <View className="items-center gap-1">
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 24, letterSpacing: -0.5 }}
              >
                {userEmail.split("@")[0]}
              </Text>
              <Text className="text-[13px] text-muted">{userEmail}</Text>
            </View>
          </View>
        </MotiView>

        {/* ── Stat tiles ───────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 80 }}
        >
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatTile
                label={t("client.profileTab.totalNotes")}
                value={notesQuery.isLoading ? "…" : String(totalNotes)}
              />
            </View>
            <View className="flex-1">
              <StatTile
                label={t("client.profileTab.thisMonth")}
                value={notesQuery.isLoading ? "…" : String(thisMonthBookings)}
              />
            </View>
            <View className="flex-1">
              <StatTile
                label={t("client.profileTab.activePkgs")}
                value={packagesQuery.isLoading ? "…" : String(activePackages)}
              />
            </View>
          </View>
        </MotiView>

        {/* ── My Packages ──────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 160 }}
        >
          <View className="flex-col gap-4">
            <SectionLabel>{t("client.profileTab.myPackages")}</SectionLabel>
            {packagesQuery.isError ? (
              <ErrorState message={t("client.package.error")} />
            ) : null}
            {packages.length === 0 && !packagesQuery.isLoading ? (
              <EmptyState title={t("client.package.noActive")} />
            ) : null}
            {packages.map((pkg: ClientPackage) => {
              const progress = getPackageProgress(pkg);
              const total = pkg.packageType?.sessionCount ?? 0;
              return (
                <GlassCard key={pkg.id}>
                  <View className="flex-row items-center gap-4">
                    <ProgressRing
                      size={56}
                      strokeWidth={5}
                      progress={progress}
                      label={String(pkg.sessionsRemaining)}
                      sublabel={total > 0 ? `/${total}` : undefined}
                    />
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center justify-between">
                        <Text
                          className="font-body-semibold text-foreground"
                          style={{ fontSize: 15 }}
                        >
                          {pkg.packageType?.name ?? t("client.package.packageName")}
                        </Text>
                        <Badge status={getPackageStatus(pkg)}>
                          {getPackageStatusLabel(pkg, t)}
                        </Badge>
                      </View>
                      <Text className="text-[12px] text-muted">
                        {t("client.profileTab.sessions", {
                          remaining: pkg.sessionsRemaining,
                          total: total > 0 ? total : "?",
                        })}
                      </Text>
                      <Text className="text-[12px] text-muted">
                        {t("client.profileTab.expires", {
                          date: new Date(pkg.expiresAt).toLocaleDateString(dateLocale),
                        })}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </View>
        </MotiView>

        {/* ── Training history (link → stack child) ────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <View className="flex-col gap-4">
            <SectionLabel>{t("client.profileTab.trainingHistory")}</SectionLabel>
            <Pressable
              onPress={() => router.push("/(client)/profile/history")}
              android_ripple={null}
              className="active:opacity-80"
            >
              <GlassCard>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <FontAwesome name="sticky-note-o" size={16} color={tokens.muted} />
                    <Text
                      className="text-foreground font-body-medium"
                      style={{ fontSize: 15 }}
                    >
                      {t("client.profileTab.trainingHistory")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-muted text-[13px]">
                      {notesQuery.isLoading ? "…" : String(totalNotes)}
                    </Text>
                    <FontAwesome name="chevron-right" size={11} color={tokens.faint} />
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          </View>
        </MotiView>
      </ScrollView>
    </ScreenContainerRaw>
  );
}
