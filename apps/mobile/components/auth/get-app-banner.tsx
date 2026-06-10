/**
 * GetAppBanner — web-only "Get the app" prompt shown on email-link landing
 * pages (accept-invite, reset-password).
 *
 * When someone taps an invite/reset link and the native app IS installed, the
 * OS opens the app (Universal Links / App Links) and this page never renders.
 * When it ISN'T, the OS opens the URL in the browser and we land here — so this
 * banner offers a download link to the right store (UA-detected). The form
 * underneath still works, so there's no dead end: activate in the browser now,
 * or grab the app. On native it renders nothing (the app is already open).
 */

import { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { StudioButton } from "@/components/ui/studio";
import { sharedEnv } from "@/lib/env.shared";
import { getStoreTarget } from "@/lib/store-links";

function resolveTarget() {
  if (Platform.OS !== "web") return null;
  if (typeof navigator === "undefined") return null; // SSR guard
  const { url } = getStoreTarget(navigator.userAgent, {
    ios: sharedEnv.EXPO_PUBLIC_IOS_STORE_URL,
    android: sharedEnv.EXPO_PUBLIC_ANDROID_STORE_URL,
  });
  return url;
}

export function GetAppBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const url = resolveTarget();

  if (!url || dismissed) return null;

  return (
    <View
      testID="get-app-banner"
      className="bg-glass border border-glass-border rounded-xl px-4 py-3 mb-4 flex-row items-center gap-3"
    >
      <View className="flex-1">
        <Text className="font-body-semibold text-foreground text-[14px]">
          {t("auth.getAppTitle")}
        </Text>
        <Text className="font-sans text-muted text-[12px] mt-0.5">
          {t("auth.getAppSubtitle")}
        </Text>
        <View className="mt-2.5 self-start">
          <StudioButton
            testID="get-app-button"
            label={t("auth.getAppButton")}
            onPress={() => Linking.openURL(url).catch(() => {})}
          />
        </View>
      </View>
      <Pressable
        testID="get-app-dismiss"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("auth.getAppDismiss")}
        onPress={() => setDismissed(true)}
        className="p-1"
      >
        <Icon name="chevron-right" size={18} color="#9ca3af" />
      </Pressable>
    </View>
  );
}
