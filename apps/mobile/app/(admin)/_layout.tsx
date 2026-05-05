import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
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

  return (
    <Tabs
      screenOptions={{ ...getAppTabScreenOptions(isDark), headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.dashboard"),
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("tabs.clients"),
          tabBarIcon: ({ color }) => <TabIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="packages"
        options={{
          title: t("tabs.packages"),
          tabBarIcon: ({ color }) => <TabIcon name="archive" color={color} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: t("tabs.billing"),
          tabBarIcon: ({ color }) => (
            <TabIcon name="credit-card" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t("tabs.reports"),
          tabBarIcon: ({ color }) => <TabIcon name="bar-chart" color={color} />,
        }}
      />
      {/* Hidden detail routes pushed from the dashboard. */}
      <Tabs.Screen name="class-types" options={{ href: null }} />
      <Tabs.Screen name="rooms" options={{ href: null }} />
    </Tabs>
  );
}
