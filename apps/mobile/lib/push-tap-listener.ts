import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useNotificationTapHandler } from "@/lib/notification-tap";

type Params = {
  isAuthenticated: boolean;
};

type NotificationResponseLike = {
  notification: {
    request: {
      identifier?: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

/**
 * Subscribes to OS-level push notification taps (Expo) and routes the user
 * through the same notification-tap handler the in-app inbox uses.
 *
 * Reads `__notificationType` from the push `data` (injected by the server in
 * `sendExpoPushNotifications`) to know which type's routing rules to apply.
 *
 * Handles both:
 *   • Warm taps — `addNotificationResponseReceivedListener` while the app is
 *     backgrounded or running.
 *   • Cold-start taps — `getLastNotificationResponseAsync()` to catch the
 *     response that launched the app, since the listener is attached AFTER
 *     the response is delivered to expo-notifications.
 *
 * Cold-start handling is gated on `isAuthenticated` so we don't try to
 * navigate to an admin route before the session has been hydrated. We also
 * dedupe by request identifier so the cold-start response isn't re-handled
 * if the live listener fires for the same one.
 */
export function usePushTapListener({ isAuthenticated }: Params) {
  const handleTap = useNotificationTapHandler();
  const handledIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    function maybeHandle(response: NotificationResponseLike | null | undefined) {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (id && handledIdsRef.current.has(id)) return;
      if (id) handledIdsRef.current.add(id);
      const data = response.notification.request.content.data as
        | (Record<string, unknown> & { __notificationType?: string })
        | undefined;
      const type =
        typeof data?.__notificationType === "string"
          ? data.__notificationType
          : null;
      if (!type) return;
      const { __notificationType: _ignore, ...rest } = data ?? {};
      handleTap({ type, payload: rest as Record<string, never> });
    }

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        // Cold-start: catch the tap that launched the app, if any.
        const initial = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled) maybeHandle(initial as NotificationResponseLike | null);

        const subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            maybeHandle(response as NotificationResponseLike);
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
