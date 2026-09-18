import { useEffect } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

type Params = {
  isAuthenticated: boolean;
};

/**
 * Refreshes the inbox when a push lands while the app is open.
 *
 * Without this the delivered push only updates the OS tray: the
 * `notifications` queries stay fresh in cache, so the newest row is missing
 * from the inbox (and from the bell badge) until the app is killed and
 * reopened. Invalidating the whole `notifications` key covers the infinite
 * list and the unread count in one go.
 */
export function usePushReceivedListener({ isAuthenticated }: Params) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        const subscription = Notifications.addNotificationReceivedListener(
          () => {
            queryClient.invalidateQueries({
              queryKey: notificationsQueries.all,
            });
          },
        );
        removeListener = () => subscription.remove();
      } catch {
        // expo-notifications unavailable (simulator without Expo Go, etc.)
      }
    })();

    return () => {
      cancelled = true;
      if (removeListener) removeListener();
    };
  }, [isAuthenticated, queryClient]);
}
