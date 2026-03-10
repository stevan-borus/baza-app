import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
  getNativeHeaderOptions,
} from "@/lib/tab-layout-theme";

function TabIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={20} {...props} />;
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const nativeHeader = getNativeHeaderOptions(isDark);

  return (
    <Tabs
      screenOptions={getAppTabScreenOptions(isDark)}
      tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.schedule"),
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
          ...nativeHeader,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("tabs.clients"),
          tabBarIcon: ({ color }) => <TabIcon name="users" color={color} />,
          ...nativeHeader,
        }}
      />
      <Tabs.Screen
        name="packages"
        options={{
          title: t("tabs.packages"),
          tabBarIcon: ({ color }) => <TabIcon name="archive" color={color} />,
          ...nativeHeader,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: t("tabs.billing"),
          tabBarIcon: ({ color }) => (
            <TabIcon name="credit-card" color={color} />
          ),
          ...nativeHeader,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("tabs.reports"),
          tabBarIcon: ({ color }) => <TabIcon name="bar-chart" color={color} />,
          ...nativeHeader,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}

