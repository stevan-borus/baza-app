import { Icon, type IconName } from "@/components/ui/icon";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { type ColorValue } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useColorScheme } from "@/components/useColorScheme";
import {
  FloatingTabBar,
  getAppTabScreenOptions,
} from "@/lib/tab-layout-theme";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { ConsentGateRedirect } from "@/components/consent/consent-gate-redirect";
import { CampaignsOptInSheet } from "@/components/notifications/campaigns-opt-in-sheet";
import {
  markCampaignsOptInSeen,
  shouldShowCampaignsOptIn,
} from "@/lib/campaigns-opt-in-prompt";

/**
 * Asks the client once whether they want marketing notifications. Serbia
 * requires opt-IN, so campaignsEnabled defaults to false and nobody is ever
 * asked; this prompt is the ask. Mounted inside the consent gate so it can
 * never appear over the legal-consent screen.
 */
function CampaignsOptInPrompt() {
  const meQuery = useQuery(authQueries.me());
  const prefsQuery = useQuery(notificationsQueries.preferences());
  const userId = meQuery.data?.user.id;
  const campaignsEnabled = prefsQuery.data?.preferences.campaignsEnabled;

  const [open, setOpen] = useState(false);

  // The seen flag lives in AsyncStorage, so resolving it is async — this
  // effect subscribes to that external store. No other effects here.
  useEffect(() => {
    let active = true;
    shouldShowCampaignsOptIn({ userId, campaignsEnabled })
      .then((show) => {
        if (active && show) setOpen(true);
      })
      .catch(() => {
        // A storage failure just means no prompt this launch.
      });
    return () => {
      active = false;
    };
  }, [userId, campaignsEnabled]);

  if (!userId) return null;

  return (
    <CampaignsOptInSheet
      open={open}
      onOpenChange={setOpen}
      onSeen={() => {
        void markCampaignsOptInSeen(userId);
      }}
    />
  );
}

function TabIcon(props: { name: IconName; color: ColorValue }) {
  return <Icon size={22} name={props.name} color={props.color} />;
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
    <ConsentGateRedirect>
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
      <CampaignsOptInPrompt />
    </ConsentGateRedirect>
  );
}
