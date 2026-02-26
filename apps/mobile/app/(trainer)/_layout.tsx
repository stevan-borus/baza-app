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
  return <FontAwesome size={22} {...props} />;
}

export default function TrainerLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

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
        name="notes"
        options={{
          title: t("tabs.notes"),
          tabBarIcon: ({ color }) => <TabIcon name="pencil" color={color} />,
        }}
      />
    </Tabs>
  );
}
