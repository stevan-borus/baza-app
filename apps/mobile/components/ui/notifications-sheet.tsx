import { createContext, useContext, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppSheet } from "./sheet";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

type NotificationsSheetContextValue = {
  open: () => void;
  close: () => void;
};

const NotificationsSheetContext = createContext<NotificationsSheetContextValue | null>(null);

/**
 * Mount once at the admin route-tree root. Mirrors ProfileSheetProvider:
 * descendants open the sheet via `useNotificationsSheet().open()` without
 * owning the mount point — keeps the sheet from being clipped inside a tiny
 * header slot.
 */
export function NotificationsSheetProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo<NotificationsSheetContextValue>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [],
  );
  return (
    <NotificationsSheetContext.Provider value={value}>
      {children}
      <NotificationsSheetContent open={isOpen} onOpenChange={setIsOpen} />
    </NotificationsSheetContext.Provider>
  );
}

export function useNotificationsSheet(): NotificationsSheetContextValue {
  const ctx = useContext(NotificationsSheetContext);
  if (!ctx) {
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}

function NotificationsSheetContent({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-4" style={{ minHeight: 400 }}>
        <Text className="text-foreground font-body-bold" style={{ fontSize: 22, letterSpacing: -0.3 }}>
          {t("admin.notifications.title")}
        </Text>
        <View style={{ flex: 1, minHeight: 360 }}>
          <NotificationsInbox context="admin" />
        </View>
      </View>
    </AppSheet>
  );
}
