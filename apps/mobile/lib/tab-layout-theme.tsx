import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeTokens } from "@/components/ui/tokens";
import { useThemePreference } from "@/lib/theme-preference";
import { ACCENT } from "@/components/ui/tokens";

export function TabIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={22} {...props} />;
}

export function AppTabLoading({ isDark: _isDark }: { isDark: boolean }) {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator size="large" color={ACCENT} />
    </View>
  );
}

type FloatingTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Routes hidden from the tab bar regardless of layout config. */
const HIDDEN_TAB_ROUTES = new Set([
  "settings",
  "class-types",
  "rooms",
  // `profile` is reachable via the header avatar's ProfileSheet on every
  // screen — no dedicated tab needed.
  "profile",
]);

/**
 * Flat full-width bottom tab bar.
 *
 * - Background matches the page background (token-driven; flips with theme).
 * - Single hairline border on top for separation.
 * - Selected: white in dark mode, accent green in light mode.
 */
export function FloatingTabBar(
  props: FloatingTabBarProps & { isDark: boolean },
) {
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const { resolvedTheme } = useThemePreference();
  const activeColor = resolvedTheme === "dark" ? "#ffffff" : tokens.accent;

  const visibleRoutes = state.routes.filter((route) => {
    if (HIDDEN_TAB_ROUTES.has(route.name)) return false;
    const descriptor = descriptors[route.key];
    const options = descriptor?.options as { href?: string | null } | undefined;
    return options?.href !== null;
  });

  return (
    <View
      style={{
        backgroundColor: tokens.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: tokens.divider,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ flexDirection: "row", height: 56 }}>
        {visibleRoutes.map((route) => {
          const index = state.routes.indexOf(route);
          const isFocused = state.index === index;
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};

          const color = isFocused ? activeColor : tokens.muted;
          const label =
            typeof options.title === "string" ? options.title : route.name;

          const icon = options.tabBarIcon?.({
            focused: isFocused,
            color,
            size: 22,
          });

          // tabBarBadge accepts string | number — when present we draw a small
          // accent dot/pill at the top-right of the icon. Numbers > 9 collapse
          // to "9+". Booleans true → unlabeled dot.
          const rawBadge = (options as { tabBarBadge?: number | string | boolean })
            .tabBarBadge;
          const badge =
            rawBadge === true
              ? ""
              : typeof rawBadge === "number"
                ? rawBadge > 9
                  ? "9+"
                  : rawBadge > 0
                    ? String(rawBadge)
                    : null
                : typeof rawBadge === "string" && rawBadge.length > 0
                  ? rawBadge
                  : null;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <View style={{ position: "relative" }}>
                {icon}
                {badge !== null ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      minWidth: badge === "" ? 8 : 16,
                      height: badge === "" ? 8 : 16,
                      borderRadius: badge === "" ? 4 : 8,
                      paddingHorizontal: badge === "" ? 0 : 4,
                      backgroundColor: ACCENT,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {badge !== "" ? (
                      <Text
                        style={{
                          color: "#ffffff",
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        {badge}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color,
                  fontSize: 10,
                  fontWeight: isFocused ? "600" : "500",
                  letterSpacing: 0.1,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function getAppTabScreenOptions(isDark: boolean) {
  return {
    headerShown: false,
    tabBarShowLabel: false,
    tabBarStyle: {
      position: "absolute" as const,
      backgroundColor: "transparent",
      borderTopWidth: 0,
      elevation: 0,
      height: 0,
    },
    tabBarBackground: () => null,
    // Paint the navigator's scene container so screens whose content is
    // shorter than the viewport still show the correct background to the
    // bottom (and behind any open bottom sheet that doesn't fully overlay).
    sceneContainerStyle: {
      backgroundColor: isDark ? "#0E0E10" : "#F4EFE3",
    },
  };
}

/** Legacy: header rendering is now fully handled by the inline AppHeader. */
export function getNativeHeaderOptions(_isDark: boolean) {
  return { headerShown: false as const };
}
