import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { Pressable, View } from "react-native";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import { useThemeTokens } from "@/components/ui/tokens";

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Header bell button with a small dot when the caller has unread
 * notifications. Reads from the same `notificationsQueries.list()` cache
 * that the inbox uses, so opening the sheet (which marks rows read) flips
 * the dot off on next refetch.
 */
export function NotificationsBell({ onPress, accessibilityLabel }: Props) {
  const tokens = useThemeTokens();
  const listQuery = useQuery(notificationsQueries.list());
  const hasUnread =
    (listQuery.data?.notifications.filter((n) => !n.readAt).length ?? 0) > 0;

  return (
    <Pressable
      testID="notifications-bell-button"
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="active:opacity-60"
    >
      <View>
        <Feather name="bell" size={20} color={tokens.foreground} />
        {hasUnread ? (
          <View
            testID="notifications-bell-unread-dot"
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: tokens.accent,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
