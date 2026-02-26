import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import { getNativeHeaderOptions } from "@/lib/tab-layout-theme";

export default function AdminSettingsLayout() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === "dark";
  const headerOptions = getNativeHeaderOptions(isDark);

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t("tabs.settings"),
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="class-types"
        options={{
          title: t("admin.manage.classTypes"),
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <Stack.Screen
        name="rooms"
        options={{
          title: t("admin.manage.rooms"),
          headerBackButtonDisplayMode: "minimal",
        }}
      />
    </Stack>
  );
}
