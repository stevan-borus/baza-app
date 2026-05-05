import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemePreference } from "@/lib/theme-preference";
import { ACCENT } from "@/components/ui/tokens";

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { preference, resolvedTheme, setPreference } = useThemePreference();
  const progress = useRef(new Animated.Value(resolvedTheme === "dark" ? 1 : 0))
    .current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: resolvedTheme === "dark" ? 1 : 0,
      useNativeDriver: true,
      stiffness: 220,
      damping: 18,
      mass: 0.9,
    }).start();
  }, [progress, resolvedTheme]);

  const thumbTransform = useMemo(
    () => ({
      transform: [
        {
          translateX: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 30],
          }),
        },
      ],
    }),
    [progress],
  );

  const isSystem = preference === "system";

  return (
    <View className="flex-col gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-col gap-1 flex-1">
          <Text className="text-base text-muted">
            {resolvedTheme === "dark"
              ? t("settings.themeDark")
              : t("settings.themeLight")}
          </Text>
          <Text className="text-sm text-muted">
            {isSystem
              ? t("settings.themeSystem")
              : t("settings.themeDescription")}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            setPreference(resolvedTheme === "dark" ? "light" : "dark")
          }
          style={{
            width: 62,
            height: 34,
            borderRadius: 999,
            backgroundColor:
              resolvedTheme === "dark"
                ? "rgba(62,94,74,0.35)"
                : "rgba(60,72,58,0.12)",
            justifyContent: "center",
            borderWidth: 1,
            borderColor:
              resolvedTheme === "dark"
                ? "rgba(130,188,152,0.25)"
                : "rgba(80,100,86,0.18)",
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <FontAwesome name="sun-o" size={11} color="#9ca3af" />
            <FontAwesome name="moon-o" size={11} color="#9ca3af" />
          </View>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: 28,
                height: 28,
                borderRadius: 999,
                backgroundColor:
                  resolvedTheme === "dark" ? "#dff4e7" : "#f8fafc",
                alignItems: "center",
                justifyContent: "center",
              },
              thumbTransform,
            ]}
          >
            <FontAwesome
              name={resolvedTheme === "dark" ? "moon-o" : "sun-o"}
              size={12}
              color={resolvedTheme === "dark" ? ACCENT : "#667085"}
            />
          </Animated.View>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setPreference(isSystem ? resolvedTheme : "system")}
      >
        <View className="flex-row items-center justify-between bg-glass border border-glass-border px-3 py-2.5 rounded-xl">
          <Text className="text-base text-foreground">
            {t("settings.themeSystem")}
          </Text>
          <FontAwesome
            name={isSystem ? "check-circle" : "circle-o"}
            size={15}
            color={isSystem ? ACCENT : "#6b7280"}
          />
        </View>
      </Pressable>
    </View>
  );
}
