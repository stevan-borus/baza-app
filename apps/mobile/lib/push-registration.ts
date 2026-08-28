import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import { getStableDeviceId } from "@/lib/device-id";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

type PushRegistrationParams = {
  isAuthenticated: boolean;
  /**
   * The signed-in user's id. Part of the effect key so an account switch on a
   * shared device re-registers: `isAuthenticated` stays true across a
   * sign-out → sign-in as a DIFFERENT user, so keying on it alone left the new
   * user with no token row at all.
   */
  userId?: string | null;
};

/** Reports a push failure without ever letting it reach the caller. */
function reportPushFailure(
  error: unknown,
  context: { stage: string; permissionStatus?: string; hasProjectId?: boolean },
) {
  Sentry.captureException(error, {
    tags: {
      feature: "push-registration",
      stage: context.stage,
      platform: Platform.OS,
    },
    extra: {
      permissionStatus: context.permissionStatus ?? "unknown",
      hasProjectId: context.hasProjectId ?? false,
    },
  });
}

/**
 * Registers Expo push token and keeps it in sync (rotation + locale updates).
 *
 * Also reports whether the OS permission was denied, so the UI can offer a way
 * into system settings — a declined prompt used to be completely invisible.
 */
export function usePushRegistration({ isAuthenticated, userId }: PushRegistrationParams) {
  const registerMutation = useMutation(notificationsQueries.registerPushToken());
  const { i18n } = useTranslation();
  const [permissionDenied, setPermissionDenied] = useState(false);

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
      if (cancelled) return;
      // Surface a declined prompt so the user can be offered a route into OS
      // settings; without this the app just never gets a token, forever.
      setPermissionDenied(finalStatus !== "granted");
      if (finalStatus !== "granted") return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      try {
        const tokenData = expoPushToken
          ? { data: expoPushToken }
          : await Notifications.getExpoPushTokenAsync(
              projectId ? { projectId } : undefined,
            );
        const deviceId = await getStableDeviceId();
        const preferredLocale = i18n.language?.startsWith("sr") ? "sr" : "en";

        // The server reclaims the token row on (userId, deviceId) and flips
        // isActive back to true, so re-POSTing is idempotent and is what
        // undoes the deactivation sign-out performed.
        await registerMutation.mutateAsync({
          deviceId,
          expoPushToken: tokenData.data,
          preferredLocale,
        });
      } catch (error) {
        reportPushFailure(error, {
          stage: expoPushToken ? "rotation" : "register",
          permissionStatus: finalStatus,
          hasProjectId: Boolean(projectId),
        });
      }
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
          registerToken(token.data).catch((error) => {
            reportPushFailure(error, { stage: "rotation-listener" });
          });
        });
        removeListener = () => subscription.remove();
      } catch (error) {
        // Push may genuinely be unavailable (simulator / unsupported env), but
        // it must still be visible — this branch previously ate real bugs.
        reportPushFailure(error, { stage: "setup" });
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
    // server at ~100% CPU). We only want to (re)register when the identity or
    // locale changes; the mutation ref is stable enough to call without tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, isAuthenticated, userId]);

  return { permissionDenied };
}
