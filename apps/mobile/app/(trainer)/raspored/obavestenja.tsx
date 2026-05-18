/**
 * Trainer Notifications page — pushed from the header bell on tab screens.
 * Uses `detail` header variant so the left slot is a back button.
 */
import { useTranslation } from "react-i18next";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

export default function TrainerNotifications() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();
  return (
    <ScreenContainerRaw title={t("tabs.notifications")} headerVariant="detail">
      <NotificationsInbox context="trainer" bottomPad={bottomPad} />
    </ScreenContainerRaw>
  );
}
