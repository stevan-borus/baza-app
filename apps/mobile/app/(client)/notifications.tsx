/**
 * Client Notifications screen.
 * Thin wrapper around the shared NotificationsInbox component, plus a
 * preferences sheet opened from the header cog. Admin uses the same
 * inbox component (without prefs) from inside a sheet (see admin layout).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeaderIconButton } from "@/components/ui/app-header";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { NotificationsPreferencesSheet } from "@/components/notifications/notifications-preferences-sheet";

export default function ClientNotifications() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  const [prefsOpen, setPrefsOpen] = useState(false);
  return (
    <ScreenContainerRaw
      title={t("tabs.notifications")}
      rightSlot={
        <HeaderIconButton
          icon="cog"
          onPress={() => setPrefsOpen(true)}
          accessibilityLabel={t("client.notifications.settingsTitle")}
        />
      }
    >
      <NotificationsInbox context="client" bottomPad={bottomPad} />
      <NotificationsPreferencesSheet open={prefsOpen} onOpenChange={setPrefsOpen} />
    </ScreenContainerRaw>
  );
}
