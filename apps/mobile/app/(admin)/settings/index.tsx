/**
 * Admin Settings index screen.
 * Design references (from docs/inspiration/):
 * - Linear Mobile ios Apr 2026/ — grouped settings with chevrons
 * - Apple Fitness ios Feb 2026/ — preferences-style section grouping
 *
 * Structure:
 *   Studio section  → Class Types, Rooms
 *   Preferences     → Language, Theme
 *   Account         → Sign out
 */
import { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { GlassCard } from "@/components/ui/glass-card";
import { AppSheet } from "@/components/ui/sheet";
import { SectionLabel } from "@/components/ui/typography";
import { GLASS_BG } from "@/components/ui/tokens";
import { HEADER_HEIGHT, TAB_BAR_HEIGHT } from "@/components/ui/constants";
import { type Locale } from "@/lib/i18n";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { useThemePreference } from "@/lib/theme-preference";

const STAGGER = [0, 80, 160, 240];

export default function AdminSettingsIndex() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { preference } = useThemePreference();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOutWithPushCleanup();
    },
    onSuccess: async () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });

  const updateLocalePrefsMutation = useMutation({
    ...notificationsQueries.updatePreferences(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] }),
  });

  const currentThemeLabel =
    preference === "dark"
      ? t("settings.themeDark")
      : preference === "light"
        ? t("settings.themeLight")
        : t("settings.themeSystem");

  const currentLanguageLabel = i18n.language?.startsWith("sr")
    ? t("common.languageSr")
    : t("common.languageEn");

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 28,
        paddingBottom: TAB_BAR_HEIGHT + 32,
      }}
    >
      <View className="px-5 flex-col gap-6">
        {/* Studio section */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: STAGGER[0] }}
        >
          <View className="flex-col gap-2">
            <SectionLabel className="pl-4">{t("settings.studioSection")}</SectionLabel>
            <GlassCard style={{ borderRadius: 16, overflow: "hidden", padding: 0 }}>
              <SettingsRow
                icon="list"
                label={t("admin.manage.classTypes")}
                onPress={() => router.push("/(admin)/settings/class-types")}
                isDark={isDark}
              />
              <View className="h-px bg-white/10 mx-4" />
              <SettingsRow
                icon="building-o"
                label={t("admin.manage.rooms")}
                onPress={() => router.push("/(admin)/settings/rooms")}
                isDark={isDark}
              />
            </GlassCard>
          </View>
        </MotiView>

        {/* Preferences section */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: STAGGER[1] }}
        >
          <View className="flex-col gap-2">
            <SectionLabel className="pl-4">{t("settings.accountSection")}</SectionLabel>
            <GlassCard style={{ borderRadius: 16, overflow: "hidden", padding: 0 }}>
              <SettingsRow
                icon="moon-o"
                label={t("settings.theme")}
                value={currentThemeLabel}
                onPress={() => setShowThemeModal(true)}
                isDark={isDark}
              />
              <View className="h-px bg-white/10 mx-4" />
              <SettingsRow
                icon="globe"
                label={t("settings.language")}
                value={currentLanguageLabel}
                onPress={() => setShowLanguageModal(true)}
                isDark={isDark}
              />
            </GlassCard>
          </View>
        </MotiView>

        {/* Account section */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 380, delay: STAGGER[2] }}
        >
          <View className="flex-col gap-2">
            <SectionLabel className="pl-4">{t("settings.otherSection")}</SectionLabel>
            <GlassCard style={{ borderRadius: 16, overflow: "hidden", padding: 0 }}>
              <SettingsRow
                icon="sign-out"
                label={t("settings.logOut")}
                onPress={() => signOutMutation.mutate()}
                destructive
                isDark={isDark}
              />
            </GlassCard>
          </View>
        </MotiView>
      </View>

      {/* Logo footer */}
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: 500, delay: STAGGER[3] }}
      >
        <View className="items-center pt-6 pb-2">
          <Image
            source={
              isDark
                ? require("@/assets/images/logo-white.png")
                : require("@/assets/images/logo-green.png")
            }
            style={{ width: 100, height: 34 }}
            contentFit="contain"
          />
        </View>
      </MotiView>

      {/* Theme sheet */}
      <AppSheet open={showThemeModal} onOpenChange={setShowThemeModal}>
        <View className="flex-col gap-3">
          <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
            {t("settings.theme")}
          </Text>
          <ThemeSwitcher />
        </View>
      </AppSheet>

      {/* Language sheet */}
      <AppSheet open={showLanguageModal} onOpenChange={setShowLanguageModal}>
        <View className="flex-col gap-3">
          <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
            {t("settings.language")}
          </Text>
          <LanguageSwitcher
            onSelectLocale={(locale: Locale) => {
              updateLocalePrefsMutation.mutate({ preferredLocale: locale });
            }}
          />
        </View>
      </AppSheet>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// SettingsRow
// ---------------------------------------------------------------------------

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  isDark,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      <View className="flex-row px-4 py-3.5 items-center justify-between">
        {/* Left: icon + label */}
        <View className="flex-row items-center gap-3.5">
          <View
            className="items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: destructive ? "rgba(239,68,68,0.15)" : GLASS_BG,
            }}
          >
            <FontAwesome
              name={icon}
              size={15}
              color={destructive ? (isDark ? "#ffffff" : "#ef4444") : "#fff"}
            />
          </View>
          <Text
            className={destructive ? "text-danger" : "text-foreground"}
            style={{ fontSize: 16, fontWeight: "500" }}
          >
            {label}
          </Text>
        </View>
        {/* Right: current value + chevron */}
        <View className="flex-row items-center gap-2">
          {value ? (
            <Text className="text-muted" style={{ fontSize: 14 }}>
              {value}
            </Text>
          ) : null}
          {!destructive && (
            <FontAwesome name="chevron-right" size={12} color="#a1a1aa" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
