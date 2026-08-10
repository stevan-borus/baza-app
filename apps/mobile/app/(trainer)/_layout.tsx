import { Icon, type IconName } from "@/components/ui/icon";
import { Tabs } from "expo-router";
import { type ColorValue } from "react-native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
} from "@/lib/tab-layout-theme";
import { ConsentGateRedirect } from "@/components/consent/consent-gate-redirect";

function TabIcon(props: { name: IconName; color: ColorValue }) {
  return <Icon size={22} name={props.name} color={props.color} />;
}

export default function TrainerLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <ConsentGateRedirect>
      <Tabs
        screenOptions={{ ...getAppTabScreenOptions(isDark), headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} isDark={isDark} />}
      >
        <Tabs.Screen
          name="raspored"
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
        <Tabs.Screen
          name="zarada"
          options={{
            title: t("tabs.earnings"),
            tabBarIcon: ({ color }) => <TabIcon name="dollar-sign" color={color} />,
          }}
        />
        {/* Profile data + theme/language switcher live entirely in the
            ProfileSheet (header avatar tap). No dedicated tab/route. */}
      </Tabs>
    </ConsentGateRedirect>
  );
}
