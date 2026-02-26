import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator } from "react-native";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { XStack, YStack } from "tamagui";

export function TabIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={22} {...props} />;
}

export function AppTabLoading({ isDark }: { isDark: boolean }) {
  return (
    <YStack flex={1} bg="$background" items="center" justify="center">
      <ActivityIndicator size="large" color={isDark ? "#4ade80" : "#264D3B"} />
    </YStack>
  );
}

type FloatingTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

export function FloatingTabBar(
  props: FloatingTabBarProps & { isDark: boolean },
) {
  const { state, descriptors, navigation, insets, isDark } = props;
  const tabCount = state.routes.length;
  const baseWidth = Platform.OS === "ios" ? 250 : 240;
  const barWidth = tabCount > 4 ? Math.min(tabCount * 52, 370) : baseWidth;
  const itemWidth = barWidth / Math.max(tabCount, 1);
  const indicatorX = useRef(
    new Animated.Value(state.index * itemWidth - 1),
  ).current;

  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: state.index * itemWidth - 1,
      useNativeDriver: true,
      stiffness: 220,
      damping: 22,
      mass: 0.8,
    }).start();
  }, [indicatorX, itemWidth, state.index]);

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: Platform.OS === "ios" ? Math.max(30, insets.bottom + 8) : 16,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: barWidth,
          height: Platform.OS === "ios" ? 62 : 58,
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        }}
      >
        <BlurView
          intensity={100}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterial"}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={{
            position: "absolute",
            left: 4,
            top: 2,
            width: itemWidth - 8,
            height: (Platform.OS === "ios" ? 62 : 58) - 6,
            borderRadius: 999,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.08)",
            transform: [{ translateX: indicatorX }],
          }}
        />

        <XStack flex={1}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const descriptor = descriptors[route.key];
            const options = descriptor?.options ?? {};

            const color = isFocused ? "#16a34a" : isDark ? "#fff" : "#8e8e93";

            const icon = options.tabBarIcon?.({
              focused: isFocused,
              color,
              size: 22,
            });

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
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
                  width: itemWidth,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {icon}
              </Pressable>
            );
          })}
        </XStack>
      </View>
    </View>
  );
}

export function getAppTabScreenOptions(isDark: boolean) {
  return {
    headerShown: false,
    tabBarActiveTintColor: isDark ? "#4ade80" : "#264D3B",
    tabBarInactiveTintColor: isDark ? "#6b7280" : "#8e8e93",
    tabBarShowLabel: false,
    tabBarStyle: {
      position: "absolute" as const,
      backgroundColor: "transparent",
      borderTopWidth: 0,
      elevation: 0,
      height: 0,
    },
    tabBarBackground: () => null,
  };
}

export function getNativeHeaderOptions(isDark: boolean) {
  return {
    headerShown: true,
    headerTransparent: true as const,
    headerBackground: () => (
      <View style={StyleSheet.absoluteFill}>
        <BlurView
          intensity={100}
          tint={
            isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"
          }
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? "rgba(0,0,0,0.16)" : "rgba(38,78,59)",
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(38,78,59,0.22)",
            },
          ]}
        />
      </View>
    ),
    headerShadowVisible: false,
    headerTintColor: "#fff",
    headerTitleStyle: {
      fontWeight: "600" as const,
      fontSize: 18,
      color: "#fff",
    },
  };
}

