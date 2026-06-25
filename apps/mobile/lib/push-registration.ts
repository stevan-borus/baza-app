import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

type PushRegistrationParams = {
  isAuthenticated: boolean;
};

/**
 * Registers Expo push token and keeps it in sync (rotation + locale updates).
 */
export function usePushRegistration({ isAuthenticated }: PushRegistrationParams) {
  const registerMutation = useMutation(notificationsQueries.registerPushToken());
  const { i18n } = useTranslation();

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;

    let cancelled = false;
    let removeListener: (() => void) | null = null;

    async function registerToken(expoPushToken?: string) {
      const Notifications = await import("expo-notifications");
      const Constants = (await import("expo-constants")).default;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted" || cancelled) return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const tokenData = expoPushToken
        ? { data: expoPushToken }
        : await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined,
          );
      const deviceId = Constants.installationId ?? "unknown";
      const preferredLocale = i18n.language?.startsWith("sr") ? "sr" : "en";

      await registerMutation.mutateAsync({
        deviceId,
        expoPushToken: tokenData.data,
        preferredLocale,
      });
    }

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        await registerToken();
        if (cancelled) return;

        const subscription = Notifications.addPushTokenListener((token) => {
          registerToken(token.data).catch(() => {
            // Ignore token rotation sync failures.
          });
        });
        removeListener = () => subscription.remove();
      } catch {
        // Push notifications not available (e.g. simulator / unsupported env).
      }
    })();

    return () => {
      cancelled = true;
      if (removeListener) removeListener();
    };
    // registerMutation is intentionally NOT a dep: useMutation returns a fresh
    // object every render, and mutateAsync re-renders this component, so
    // including it makes the effect re-run → re-register → re-render in a tight
    // loop (a POST /api/notifications/push-token flood that pegged the dev
    // server at ~100% CPU). We only want to (re)register when auth or locale
    // changes; the mutation ref is stable enough to call without tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, isAuthenticated]);
}
