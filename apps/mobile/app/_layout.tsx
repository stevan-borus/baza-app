import "../global.css";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider, KeyboardToolbar } from "react-native-keyboard-controller";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import "react-native-reanimated";

import "@/lib/i18n";
import { loadStoredLocale } from "@/lib/i18n";
import { usePushRegistration } from "@/lib/push-registration";
import { usePushTapListener } from "@/lib/push-tap-listener";
import { Providers } from "@/lib/providers";
import { useSessionAuth } from "@/lib/session-auth";
import { useColorScheme } from "@/components/useColorScheme";
import { ThemePreferenceProvider } from "@/lib/theme-preference";
import { ProfileSheetProvider } from "@/components/ui/profile-sheet";

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
    // Display: Fraunces — refined wedge serif (variable). Used for screen
    // titles, big numbers, brand chrome.
    "Fraunces-Regular": require("@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf"),
    "Fraunces-SemiBold": require("@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"),
    "Fraunces-Bold": require("@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf"),
    // Body: Albert Sans — humanist sans with quiet warmth, pairs nicely
    // with Fraunces.
    "AlbertSans-Regular": require("@expo-google-fonts/albert-sans/400Regular/AlbertSans_400Regular.ttf"),
    "AlbertSans-Medium": require("@expo-google-fonts/albert-sans/500Medium/AlbertSans_500Medium.ttf"),
    "AlbertSans-SemiBold": require("@expo-google-fonts/albert-sans/600SemiBold/AlbertSans_600SemiBold.ttf"),
    "AlbertSans-Bold": require("@expo-google-fonts/albert-sans/700Bold/AlbertSans_700Bold.ttf"),
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
    <Providers colorScheme="dark">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            {/* ThemePreferenceProvider must wrap BottomSheetModalProvider so
                the sheet's iOS FullWindowOverlay container (rendered by the
                modal provider) can read live theme via useThemePreference(). */}
            <ThemePreferenceProvider>
              <BottomSheetModalProvider>
                <RootLayoutNav />
              </BottomSheetModalProvider>
            </ThemePreferenceProvider>
          </SafeAreaProvider>
          <KeyboardToolbar />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </Providers>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <ThemeProvider value={isDark ? CustomDarkTheme : CustomLightTheme}>
      <ProfileSheetProvider>
        <View className="flex-1 bg-background">
          <AppNavigator isDark={isDark} />
        </View>
      </ProfileSheetProvider>
    </ThemeProvider>
  );
}

function AppNavigator({ isDark }: { isDark: boolean }) {
  const session = useSessionAuth();
  const isAuthenticated =
    !session.error && !!session.data?.session && !!session.role;
  usePushRegistration({ isAuthenticated });
  usePushTapListener({ isAuthenticated });

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
