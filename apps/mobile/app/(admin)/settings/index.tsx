import { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import { ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack, useTheme } from "tamagui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { AppSheet } from "@/components/ui/sheet";
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
      <YStack px="$5" gap="$6">
        <YStack gap="$2">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$color9"
            textTransform="uppercase"
            letterSpacing={0.8}
            pl="$4"
          >
            {t("settings.accountSection")}
          </Text>
          <YStack bg="$color2" rounded={16} overflow="hidden">
            <SettingsRow
              icon="moon-o"
              label={t("settings.theme")}
              value={currentThemeLabel}
              onPress={() => setShowThemeModal(true)}
            />
            <YStack height={1} bg="$borderColor" mx="$4" />
            <SettingsRow
              icon="globe"
              label={t("settings.language")}
              value={currentLanguageLabel}
              onPress={() => setShowLanguageModal(true)}
            />
          </YStack>
        </YStack>

        <YStack gap="$2">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$color9"
            textTransform="uppercase"
            letterSpacing={0.8}
            pl="$4"
          >
            {t("settings.studioSection")}
          </Text>
          <YStack bg="$color2" rounded={16} overflow="hidden">
            <SettingsRow
              icon="list"
              label={t("admin.manage.classTypes")}
              onPress={() => router.push("/(admin)/settings/class-types")}
            />
            <YStack height={1} bg="$borderColor" mx="$4" />
            <SettingsRow
              icon="building-o"
              label={t("admin.manage.rooms")}
              onPress={() => router.push("/(admin)/settings/rooms")}
            />
          </YStack>
        </YStack>

        <YStack gap="$2">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$color9"
            textTransform="uppercase"
            letterSpacing={0.8}
            pl="$4"
          >
            {t("settings.otherSection")}
          </Text>
          <YStack bg="$color2" rounded={16} overflow="hidden">
            <SettingsRow
              icon="sign-out"
              label={t("settings.logOut")}
              onPress={() => signOutMutation.mutate()}
              destructive
            />
          </YStack>
        </YStack>
      </YStack>

      <YStack items="center" pt="$6" pb="$2">
        <Image
          source={isDark ? require("@/assets/images/logo-white.png") : require("@/assets/images/logo-green.png")}
          style={{ width: 100, height: 34 }}
          contentFit="contain"
        />
      </YStack>

      <AppSheet open={showThemeModal} onOpenChange={setShowThemeModal}>
        <YStack gap="$3">
          <Text fontWeight="700" fontSize="$6" color="$color">
            {t("settings.theme")}
          </Text>
          <ThemeSwitcher />
        </YStack>
      </AppSheet>

      <AppSheet open={showLanguageModal} onOpenChange={setShowLanguageModal}>
        <YStack gap="$3">
          <Text fontWeight="700" fontSize="$6" color="$color">
            {t("settings.language")}
          </Text>
          <LanguageSwitcher
            onSelectLocale={(locale: Locale) => {
              updateLocalePrefsMutation.mutate({ preferredLocale: locale });
            }}
          />
        </YStack>
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
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const theme = useTheme();
  const isDarkMode = useColorScheme() === "dark";
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      <XStack px="$4" py="$3.5" items="center" justify="space-between">
        <XStack items="center" gap="$3.5">
          <YStack width={30} height={30} rounded={8} bg={destructive ? "$red3" : "$accent5"} items="center" justify="center">
            <FontAwesome name={icon} size={15} color={destructive ? (isDarkMode ? "#ffffff" : "#ef4444") : "#fff"} />
          </YStack>
          <Text fontSize="$4" fontWeight="500" color={destructive ? "$red10" : "$color"}>
            {label}
          </Text>
        </XStack>
        <XStack items="center" gap="$2">
          {value ? (
            <Text fontSize="$3" color="$color9">
              {value}
            </Text>
          ) : null}
          <FontAwesome name="chevron-right" size={12} color={theme.color9?.val ?? "#999"} />
        </XStack>
      </XStack>
    </TouchableOpacity>
  );
}
