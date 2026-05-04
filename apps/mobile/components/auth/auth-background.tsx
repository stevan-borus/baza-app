/**
 * AuthBackground — Studio look. Bone canvas + Baza logo lockup at top.
 *
 * Provides the keyboard-aware scroll container. Auth screens are responsible
 * for vertically centering their hero+form within the available space using
 * `<View className="flex-1 justify-center">`.
 */
import React from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useThemeTokens } from "@/components/ui/tokens";
import { useThemePreference } from "@/lib/theme-preference";

const LOGO_BAZA = require("@/assets/studio/baza-logo.webp");

export function AuthBackground({
  children,
  showLogo = true,
  showBack = false,
  onBack,
}: {
  children: React.ReactNode;
  showLogo?: boolean;
  /** Render a back chevron on the left of the logo row. */
  showBack?: boolean;
  /** Defaults to `router.back()`. */
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 12,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showLogo ? (
            <View className="flex-row items-center justify-center mb-2 relative h-9">
              {showBack ? (
                <Pressable
                  onPress={onBack ?? (() => router.back())}
                  hitSlop={12}
                  android_ripple={null}
                  className="absolute left-0 top-0 bottom-0 justify-center active:opacity-60"
                >
                  <Feather
                    name="chevron-left"
                    size={26}
                    color={tokens.foreground}
                  />
                </Pressable>
              ) : null}
              <Image
                source={LOGO_BAZA}
                style={{ width: 130, height: 38 }}
                resizeMode="contain"
              />
            </View>
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
