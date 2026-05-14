import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
} from "@/lib/tab-layout-theme";
import { NotificationsSheetProvider } from "@/components/ui/notifications-sheet";

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
    <NotificationsSheetProvider>
      <Tabs
        screenOptions={{ ...getAppTabScreenOptions(isDark), headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
      >
        <Tabs.Screen
          name="pregled"
          options={{
            title: t("tabs.overview"),
            tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="katalog"
          options={{
            title: t("tabs.catalog"),
            tabBarIcon: ({ color }) => <TabIcon name="th-large" color={color} />,
          }}
        />
        <Tabs.Screen
          name="klijenti"
          options={{
            title: t("tabs.clients"),
            tabBarIcon: ({ color }) => <TabIcon name="users" color={color} />,
          }}
        />
        <Tabs.Screen
          name="naplata"
          options={{
            title: t("tabs.billing"),
            tabBarIcon: ({ color }) => (
              <TabIcon name="credit-card" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="izvestaji"
          options={{
            title: t("tabs.reports"),
            tabBarIcon: ({ color }) => <TabIcon name="bar-chart" color={color} />,
          }}
        />
      </Tabs>
    </NotificationsSheetProvider>
  );
}
