import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { router, type Href } from "expo-router";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

/**
 * Variant for the Raspored (schedule) page — UserAvatar + NotificationsBell.
 * The bell pushes to /(trainer)/raspored/obavestenja. Only the main schedule page
 * shows the bell; other trainer screens (Klijenti, Beleške) just show
 * UserAvatar via ScreenContainerRaw's default left slot.
 */
export function TrainerScheduleLeftSlot() {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <UserAvatar />
      <NotificationsBell
        onPress={() => router.push("/(trainer)/raspored/obavestenja" as Href)}
        accessibilityLabel={t("admin.notifications.bellLabel")}
      />
    </View>
  );
}
