import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { z } from "zod";
import { apiRequest } from "@/lib/api-request";
import { sharedEnv } from "@/lib/env.shared";
import {
  decideUpdatePrompt,
  type UpdatePrompt,
} from "@/lib/app-updates/decide-update-prompt";
import { devForcedPrompt } from "@/lib/app-updates/dev-forced-prompt";
import { nativeStoreUrl } from "@/lib/app-updates/store-url";

/**
 * The native-orchestration layer of the app-update feature. Deliberately thin:
 * every branch of *decision* logic lives in pure, unit-tested helpers
 * (decideUpdatePrompt / resolveAppVersion / nativeStoreUrl). This hook only
 * does the I/O those helpers can't:
 *
 *   - background OTA check + fetch via expo-updates
 *   - GET /api/app-version for the store min/latest
 *   - read the installed binary version via expo-application
 *   - apply the prompt's action (reload for OTA, open store otherwise)
 *
 * No-op on web, in dev, and in Expo Go (expo-updates is disabled there), so the
 * whole feature is inert outside a real OTA-enabled build.
 */

const versionResponseSchema = z.object({
  minVersion: z.string(),
  latestVersion: z.string(),
});

export type AppUpdateState = {
  prompt: UpdatePrompt;
  /** Apply the current prompt: reload for OTA, open the store otherwise. */
  apply: () => void;
  /** Dismiss the soft/OTA prompt (no effect on a required block). */
  dismiss: () => void;
};

export function useAppUpdates(): AppUpdateState {
  const [prompt, setPrompt] = useState<UpdatePrompt>("none");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Dev-only preview: expo-updates is disabled in dev/Expo Go, so this is the
    // only way to see the popups in a simulator. Set
    // EXPO_PUBLIC_FORCE_UPDATE_PROMPT=ota|store-soft|store-required.
    if (__DEV__) {
      const forced = devForcedPrompt(process.env.EXPO_PUBLIC_FORCE_UPDATE_PROMPT);
      if (forced) setPrompt(forced);
      return;
    }
    if (Platform.OS === "web") return;

    let cancelled = false;

    (async () => {
      try {
        const Updates = await import("expo-updates");
        // Expo Go / dev-client without an update URL → feature off.
        if (!Updates.isEnabled) return;

        const Application = await import("expo-application");
        const currentVersion = Application.nativeApplicationVersion ?? "";

        // OTA: check + fetch in the background; ready only once downloaded.
        let otaReady = false;
        try {
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) {
            const fetched = await Updates.fetchUpdateAsync();
            otaReady = fetched.isNew;
          }
        } catch {
          // Network/registry hiccup — fall through to the store check.
        }

        // Store: ask our server what the min/latest binary versions are.
        let minVersion = currentVersion;
        let latestVersion = currentVersion;
        try {
          const platform = Platform.OS === "android" ? "android" : "ios";
          const info = await apiRequest("/api/app-version", {
            params: { platform },
            schema: versionResponseSchema,
            errorMessage: "Failed to fetch app version",
          });
          minVersion = info.minVersion;
          latestVersion = info.latestVersion;
        } catch {
          // Server unreachable — don't block; min=latest=current → "none".
        }

        if (cancelled) return;
        setPrompt(
          decideUpdatePrompt({ otaReady, currentVersion, minVersion, latestVersion }),
        );
      } catch {
        // expo-updates/application unavailable (e.g. Expo Go) — stay inert.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const effectivePrompt: UpdatePrompt =
    dismissed && prompt !== "store-required" ? "none" : prompt;

  return {
    prompt: effectivePrompt,
    dismiss: () => setDismissed(true),
    apply: () => {
      void (async () => {
        if (prompt === "ota") {
          const Updates = await import("expo-updates");
          await Updates.reloadAsync();
          return;
        }
        // store-soft / store-required → open the store.
        const Linking = await import("expo-linking");
        const httpsUrl =
          Platform.OS === "android"
            ? sharedEnv.EXPO_PUBLIC_ANDROID_STORE_URL
            : sharedEnv.EXPO_PUBLIC_IOS_STORE_URL;
        if (!httpsUrl) return;
        await Linking.openURL(nativeStoreUrl(httpsUrl, Platform.OS));
      })();
    },
  };
}
