import { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { GlassCard } from "@/components/ui/glass-card";
import { AppSheet } from "@/components/ui/sheet";
import { GLASS_BG } from "@/components/ui/tokens";
import { HEADER_HEIGHT, TAB_BAR_HEIGHT } from "@/components/ui/constants";
import { type Locale } from "@/lib/i18n";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { useThemePreference } from "@/lib/theme-preference";

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
        <View className="flex-col gap-2">
          <Text
            className="text-muted font-semibold uppercase pl-4"
            style={{ fontSize: 12, letterSpacing: 0.8 }}
          >
            {t("settings.accountSection")}
          </Text>
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

        <View className="flex-col gap-2">
          <Text
            className="text-muted font-semibold uppercase pl-4"
            style={{ fontSize: 12, letterSpacing: 0.8 }}
          >
            {t("settings.studioSection")}
          </Text>
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

        <View className="flex-col gap-2">
          <Text
            className="text-muted font-semibold uppercase pl-4"
            style={{ fontSize: 12, letterSpacing: 0.8 }}
          >
            {t("settings.otherSection")}
          </Text>
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
      </View>

      <View className="items-center pt-6 pb-2">
        <Image
          source={isDark ? require("@/assets/images/logo-white.png") : require("@/assets/images/logo-green.png")}
          style={{ width: 100, height: 34 }}
          contentFit="contain"
        />
      </View>

      <AppSheet open={showThemeModal} onOpenChange={setShowThemeModal}>
        <View className="flex-col gap-3">
          <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
            {t("settings.theme")}
          </Text>
          <ThemeSwitcher />
        </View>
      </AppSheet>

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
        <View className="flex-row items-center gap-2">
          {value ? (
            <Text className="text-muted" style={{ fontSize: 14 }}>
              {value}
            </Text>
          ) : null}
          <FontAwesome name="chevron-right" size={12} color="#a1a1aa" />
        </View>
      </View>
    </TouchableOpacity>
  );
}
