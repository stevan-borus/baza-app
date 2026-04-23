/**
 * Client profile screen — redesigned (P2-T16).
 *
 * Design references (from docs/inspiration/):
 * - ClassPass ios May 2022/ — credits/packages section layout
 * - WHOOP ios Apr 2024/ — profile stat grouping
 *
 * Structure:
 *   ScreenContainer (scrollable)
 *   ├─ Hero: large avatar (80px initials), name (bold 24px), email (muted)
 *   ├─ StatTile row: Total sessions · Bookings this month · Active packages
 *   ├─ GlassCard "My Packages": ProgressRing per package + details + status badge
 *   ├─ GlassCard "Training history": trainer notes list (up to 20)
 *   ├─ GlassCard "Preferences": language switcher + notification settings row
 *   └─ Sign out button (full-width danger)
 *
 * Sections stagger in with MotiView at 0 / 80 / 160 / 240 / 320 / 400 ms.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { MotiView } from "moti";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionLabel } from "@/components/ui/typography";
import { EmptyState, ErrorState, ListRow } from "@/components/ui/states";
import { ScreenContainer } from "@/components/ui/screen-container";
import { getDateLocale } from "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { packagesQueries, type ClientPackage } from "@/lib/queries/packages-queries-factory";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";

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
  const dateLocale = getDateLocale();
  const [refreshing, setRefreshing] = useState(false);

  const meQuery = useQuery(authQueries.me());
  const packagesQuery = useQuery(packagesQueries.clientPackages());
  const notesQuery = useQuery(trainerNotesQueries.list());

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: async () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });

  const packages = packagesQuery.data?.packages ?? [];
  const notes = notesQuery.data?.notes ?? [];
  const userEmail = meQuery.data?.user.email ?? "";
  const initials = userEmail ? getInitials(userEmail) : "?";

  // Derive stats from available data
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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#2e5b42"
          colors={["#2e5b42"]}
        />
      }
    >
      <ScreenContainer>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 0 }}
        >
          <View className="items-center gap-3 pb-2">
            {/* Avatar circle */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "rgba(46, 91, 66, 0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                className="text-accent font-bold"
                style={{ fontSize: 28, letterSpacing: 1 }}
              >
                {initials}
              </Text>
            </View>
            {/* Name + email */}
            <View className="items-center gap-1">
              <Text className="text-foreground font-bold" style={{ fontSize: 24, letterSpacing: -0.5 }}>
                {userEmail.split("@")[0]}
              </Text>
              <Text className="text-[13px] text-muted">
                {userEmail}
              </Text>
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
                    {/* Progress ring */}
                    <ProgressRing
                      size={56}
                      strokeWidth={5}
                      progress={progress}
                      label={String(pkg.sessionsRemaining)}
                      sublabel={total > 0 ? `/${total}` : undefined}
                    />
                    {/* Details */}
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center justify-between">
                        <Text className="font-semibold text-foreground" style={{ fontSize: 15 }}>
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

        {/* ── Training history ─────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
        >
          <View className="flex-col gap-4">
            <SectionLabel>{t("client.profileTab.trainingHistory")}</SectionLabel>
            {notesQuery.isError ? (
              <ErrorState message={t("client.history.error")} />
            ) : null}
            {notes.length === 0 && !notesQuery.isLoading ? (
              <EmptyState title={t("client.history.noNotes")} />
            ) : (
              <GlassCard>
                <View className="flex-col gap-3">
                  {notes.slice(0, 20).map((note: TrainerNote) => (
                    <ListRow
                      key={note.id}
                      title={note.note}
                      subtitle={`${new Date(note.createdAt).toLocaleDateString(dateLocale)}${note.trainer ? ` · ${note.trainer.fullName}` : ""}`}
                    />
                  ))}
                </View>
              </GlassCard>
            )}
          </View>
        </MotiView>

        {/* ── Preferences ──────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 320 }}
        >
          <View className="flex-col gap-4">
            <SectionLabel>{t("client.profileTab.preferences")}</SectionLabel>
            <GlassCard>
              <View className="flex-col gap-4">
                {/* Language */}
                <View className="flex-col gap-2">
                  <Text className="text-[13px] text-muted uppercase tracking-wider font-semibold">
                    {t("client.profileTab.language")}
                  </Text>
                  <LanguageSwitcher />
                </View>
                {/* Notification settings row */}
                <TouchableOpacity
                  className="flex-row items-center justify-between py-2"
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t("client.profileTab.notificationSettings")}
                >
                  <View className="flex-row items-center gap-3">
                    <FontAwesome name="bell-o" size={16} color="rgba(255,255,255,0.45)" />
                    <Text className="text-[15px] text-foreground">
                      {t("client.profileTab.notificationSettings")}
                    </Text>
                  </View>
                  <FontAwesome name="chevron-right" size={12} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        </MotiView>

        {/* ── Sign out ─────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350, delay: 400 }}
        >
          <View className="flex-col gap-4">
            <SectionLabel>{t("client.profileTab.account")}</SectionLabel>
            <Button
              variant="danger"
              onPress={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              {t("client.signOut")}
            </Button>
          </View>
        </MotiView>

      </ScreenContainer>
    </ScrollView>
  );
}
