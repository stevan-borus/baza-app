/**
 * Client Notifications screen.
 * Thin wrapper around the shared NotificationsInbox component — admin
 * uses the same component from a header sheet.
 */
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

export default function ClientNotifications() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw title={t("tabs.notifications")}>
      <NotificationsInbox context="client" bottomPad={bottomPad} showPreferences />
    </ScreenContainerRaw>
  );
}
