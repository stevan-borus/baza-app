import "@tamagui/native/setup-zeego";
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
import { ActivityIndicator, StyleSheet } from "react-native";
import { YStack } from "tamagui";
import "react-native-reanimated";

import "@/lib/i18n";
import { loadStoredLocale } from "@/lib/i18n";
import { usePushRegistration } from "@/lib/push-registration";
import { Providers } from "@/lib/providers";
import { useSessionAuth } from "@/lib/session-auth";
import { useColorScheme } from "@/components/useColorScheme";
import { ThemePreferenceProvider } from "@/lib/theme-preference";
import { navigationThemeColors } from "@/tamagui.config";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    ...navigationThemeColors.dark,
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    ...navigationThemeColors.light,
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
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    loadStoredLocale();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemePreferenceProvider>
      <RootLayoutNav />
    </ThemePreferenceProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <ThemeProvider value={isDark ? CustomDarkTheme : CustomLightTheme}>
      <Providers colorScheme={isDark ? "dark" : "light"}>
        <YStack flex={1}>
          <AppNavigator isDark={isDark} />
          <LinearGradient
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            colors={
              isDark
                ? [
                    "rgba(46,91,66,0.06)",
                    "rgba(46,91,66,0.10)",
                    "rgba(46,91,66,0.03)",
                  ]
                : [
                    "rgba(255,248,240,0.3)",
                    "rgba(46,91,66,0.03)",
                    "rgba(255,248,240,0.2)",
                  ]
            }
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </YStack>
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
      <YStack flex={1} bg="$background" items="center" justify="center">
        <ActivityIndicator
          size="large"
          color="#2e5b42"
        />
      </YStack>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        headerTintColor: isDark
          ? navigationThemeColors.dark.primary
          : navigationThemeColors.light.primary,
        headerStyle: {
          backgroundColor: isDark
            ? navigationThemeColors.dark.background
            : navigationThemeColors.light.background,
        },
        headerTitleStyle: {
          fontWeight: "600",
          fontSize: 17,
        },
        contentStyle: {
          backgroundColor: isDark
            ? navigationThemeColors.dark.background
            : navigationThemeColors.light.background,
        },
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
        <Stack.Screen
          name="sign-in"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="reset-password"
          options={{
            headerShown: false,
          }}
        />
      </Stack.Protected>
      <Stack.Screen name="index" />
    </Stack>
  );
}

