/**
 * Client Notifications screen.
 * Thin wrapper around the shared NotificationsInbox component. Notification
 * preferences live on the Profile settings screen, not here. Admin uses the
 * same inbox component from inside a sheet (see admin layout).
 */
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

export default function ClientNotifications() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw title={t("tabs.notifications")}>
      <NotificationsInbox context="client" bottomPad={bottomPad} />
    </ScreenContainerRaw>
  );
}
