import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { router, type Href } from "expo-router";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

/**
 * Default left slot for admin tab screens — just the UserAvatar (opens
 * ProfileSheet). Used on Katalog / Klijenti / Naplata / Izveštaji.
 */
export function AdminTabLeftSlot() {
  return <UserAvatar />;
}

/**
 * Variant for the main Pregled page — UserAvatar + NotificationsBell.
 * The bell pushes a stack child route (`pregled/obavestenja`) so the
 * inbox lives under the Pregled tab, where you'd expect a dashboard
 * notification to live.
 */
export function AdminPregledLeftSlot() {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <UserAvatar />
      <NotificationsBell
        onPress={() => router.push("/(admin)/pregled/obavestenja" as Href)}
        accessibilityLabel={t("admin.notifications.bellLabel")}
      />
    </View>
  );
}
