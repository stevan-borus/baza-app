import { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
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
      <YStack px="$5" gap="$8">
        <YStack>
          <SectionDividerLabel label={t("settings.accountSection")} />
          <YStack pl="$1">
            <SettingsRow
              icon="moon-o"
              label={t("settings.theme")}
              value={currentThemeLabel}
              onPress={() => setShowThemeModal(true)}
            />
            <SettingsRow
              icon="globe"
              label={t("settings.language")}
              value={currentLanguageLabel}
              onPress={() => setShowLanguageModal(true)}
            />
          </YStack>
        </YStack>

        <YStack>
          <SectionDividerLabel label={t("settings.studioSection")} />
          <YStack pl="$1">
            <SettingsRow
              icon="list"
              label={t("admin.manage.classTypes")}
              onPress={() => router.push("/(admin)/settings/class-types")}
            />
            <SettingsRow
              icon="building-o"
              label={t("admin.manage.rooms")}
              onPress={() => router.push("/(admin)/settings/rooms")}
            />
          </YStack>
        </YStack>

        <YStack>
          <SectionDividerLabel label={t("settings.otherSection")} />
          <YStack pl="$1">
            <SettingsRow
              icon="sign-out"
              label={t("settings.logOut")}
              onPress={() => signOutMutation.mutate()}
            />
          </YStack>
        </YStack>
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

function SectionDividerLabel({ label }: { label: string }) {
  return (
    <XStack items="center" gap="$3" mb="$2">
      <Text
        fontSize="$2"
        fontWeight="600"
        color="$color10"
        textTransform="uppercase"
        letterSpacing={0.5}
      >
        {label}
      </Text>
      <YStack flex={1} height={1} bg="$borderColor" />
    </XStack>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      <XStack py="$3.5" items="center" justify="space-between">
        <XStack items="center" gap="$3.5">
          <YStack width={28} items="center">
            <FontAwesome name={icon} size={18} color="#64748b" />
          </YStack>
          <Text fontSize="$4" fontWeight="500" color="$color">
            {label}
          </Text>
        </XStack>
        <XStack items="center" gap="$2">
          {value ? (
            <Text fontSize="$3" color="$color10">
              {value}
            </Text>
          ) : null}
          <FontAwesome name="chevron-right" size={13} color="#4b5563" />
        </XStack>
      </XStack>
    </TouchableOpacity>
  );
}
