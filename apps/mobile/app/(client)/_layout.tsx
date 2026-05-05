import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
} from "@/lib/tab-layout-theme";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

function TabIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={22} {...props} />;
}

export default function ClientLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Surface the unread-notifications count as a tab badge. Drives the dot/pill
  // on the bell tab; previously this lived as a bell icon in the home header.
  const notifsQuery = useQuery(notificationsQueries.list());
  const unreadCount =
    notifsQuery.data?.notifications.filter((n) => !n.readAt).length ?? 0;

  return (
    <Tabs
      screenOptions={{ ...getAppTabScreenOptions(isDark), headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.overview"),
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("tabs.calendar"),
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t("tabs.notifications"),
          tabBarIcon: ({ color }) => <TabIcon name="bell" color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
