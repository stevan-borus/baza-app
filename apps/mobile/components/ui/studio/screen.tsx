/**
 * StudioScreen — bone canvas + Baza logo header. Replaces the green
 * AppHeader for screens adopting the new look.
 */
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { useThemeTokens } from "@/components/ui/tokens";
import { useThemePreference } from "@/lib/theme-preference";

const LOGO_BAZA = require("@/assets/studio/baza-logo.webp");

export type StudioHeaderVariant = "tab" | "detail" | "none";

export function StudioScreen({
  children,
  variant = "tab",
  rightSlot,
  onBack,
}: {
  children: React.ReactNode;
  variant?: StudioHeaderVariant;
  rightSlot?: React.ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();
  const meQuery = useQuery(authQueries.me());
  const userInitial = (meQuery.data?.user.email ?? "B")
    .charAt(0)
    .toUpperCase();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />

      {variant !== "none" ? (
        <View
          className="bg-background"
          style={{ paddingTop: insets.top }}
        >
          <View className="px-5 py-3.5 flex-row items-center justify-between">
            {variant === "tab" ? (
              <Pressable
                onPress={() => router.push("/(client)/profile")}
                hitSlop={8}
                android_ripple={null}
                className="w-9 h-9 rounded-full bg-foreground items-center justify-center active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel={t("common.a11yOpenProfile")}
              >
                <Text className="font-body-semibold text-background text-[13px]">
                  {userInitial}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onBack ?? (() => router.back())}
                hitSlop={12}
                android_ripple={null}
                className="w-9 h-9 items-start justify-center active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel={t("common.a11yGoBack")}
              >
                <Icon name="chevron-left" size={26} color={tokens.foreground} />
              </Pressable>
            )}

            <Image
              source={LOGO_BAZA}
              style={{ width: 110, height: 32 }}
              resizeMode="contain"
            />

            <View className="min-w-9 items-end justify-center">
              {rightSlot}
            </View>
          </View>
        </View>
      ) : null}

      {children}
    </View>
  );
}
