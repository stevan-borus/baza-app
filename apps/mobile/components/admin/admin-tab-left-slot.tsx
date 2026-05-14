import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { useNotificationsSheet } from "@/components/ui/notifications-sheet";

/**
 * Composite for the admin tab header's left slot — UserAvatar (opens
 * ProfileSheet) plus NotificationsBell (opens NotificationsSheet).
 * Used by every admin tab screen via ScreenContainer's leftSlot prop.
 */
export function AdminTabLeftSlot() {
  const { t } = useTranslation();
  const notificationsSheet = useNotificationsSheet();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <UserAvatar />
      <NotificationsBell
        onPress={notificationsSheet.open}
        accessibilityLabel={t("admin.notifications.bellLabel")}
      />
    </View>
  );
}
