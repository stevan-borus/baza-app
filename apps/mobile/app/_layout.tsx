import "../global.css";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import "@/lib/i18n";
import { loadStoredLocale } from "@/lib/i18n";
import { usePushRegistration } from "@/lib/push-registration";
import { Providers } from "@/lib/providers";
import { useSessionAuth } from "@/lib/session-auth";
import { useColorScheme } from "@/components/useColorScheme";
import { ThemePreferenceProvider } from "@/lib/theme-preference";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const ACCENT = "#2e5b42";
const BG_DARK = "#0A0F14";
const BG_LIGHT = "#fafaf8";

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: BG_DARK,
    card: BG_DARK,
    primary: ACCENT,
    text: "rgba(255,255,255,0.9)",
    border: "rgba(255,255,255,0.08)",
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: BG_LIGHT,
    card: BG_LIGHT,
    primary: ACCENT,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    loadStoredLocale();
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <RootLayoutNav />
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <ThemeProvider value={isDark ? CustomDarkTheme : CustomLightTheme}>
      <Providers colorScheme={isDark ? "dark" : "light"}>
        <View className="flex-1">
          <LinearGradient
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            colors={
              isDark
                ? ["rgba(46,91,66,0.06)", "rgba(46,91,66,0.10)", "rgba(46,91,66,0.03)"]
                : ["rgba(255,248,240,0.3)", "rgba(46,91,66,0.03)", "rgba(255,248,240,0.2)"]
            }
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <AppNavigator isDark={isDark} />
        </View>
      </Providers>
    </ThemeProvider>
  );
}

function AppNavigator({ isDark }: { isDark: boolean }) {
  const session = useSessionAuth();
  const isAuthenticated =
    !session.error && !!session.data?.session && !!session.role;
  usePushRegistration({ isAuthenticated });

  if (session.isPending) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isDark ? BG_DARK : BG_LIGHT },
      }}
    >
      <Stack.Protected guard={session.role === "ADMIN"}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
      <Stack.Protected guard={session.role === "TRAINER"}>
        <Stack.Screen name="(trainer)" />
      </Stack.Protected>
      <Stack.Protected guard={session.role === "CLIENT"}>
        <Stack.Screen name="(client)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Screen name="index" />
    </Stack>
  );
}
