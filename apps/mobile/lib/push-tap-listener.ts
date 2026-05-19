import { useEffect } from "react";
import { Platform } from "react-native";
import { useNotificationTapHandler } from "@/lib/notification-tap";

type Params = {
  isAuthenticated: boolean;
};

/**
 * Subscribes to OS-level push notification taps (Expo) and routes the user
 * through the same notification-tap handler the in-app inbox uses.
 *
 * Reads `__notificationType` from the push `data` (injected by the server in
 * `sendExpoPushNotifications`) to know which type's routing rules to apply.
 */
export function usePushTapListener({ isAuthenticated }: Params) {
  const handleTap = useNotificationTapHandler();

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        const subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data as
              | (Record<string, unknown> & { __notificationType?: string })
              | undefined;
            const type = typeof data?.__notificationType === "string" ? data.__notificationType : null;
            if (!type) return;
            // Strip the routing marker before handing to the resolver.
            const { __notificationType: _ignore, ...rest } = data ?? {};
            handleTap({
              type,
              payload: rest as Record<string, never>,
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
  }, [handleTap, isAuthenticated]);
}
