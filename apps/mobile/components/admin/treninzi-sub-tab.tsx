/**
 * TreninziSubTab — the Predstojeci / Istorija underline tab used inside the
 * client detail's Treninzi tab. Extracted from `client-detail.tsx` so its
 * active-underline behavior can be unit-tested without spinning up the full
 * React-Native + TanStack-Query environment the parent depends on.
 *
 * Active state paints a 2px foreground rule along the bottom edge that
 * overlaps the parent's 1px hairline (via marginBottom: -1). Inactive state
 * shows a muted label with no rule.
 */
import { Pressable, Text } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";

export function TreninziSubTab({
  testID,
  label,
  active,
  onPress,
}: {
  testID?: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={null}
      className="active:opacity-70"
      style={{
        paddingVertical: 10,
        // Compensate for the parent's 1px bottom border so the active 2px
        // rule overlaps it cleanly instead of stacking.
        marginBottom: -1,
        borderBottomWidth: 2,
        borderBottomColor: active ? tokens.foreground : "transparent",
      }}
    >
      <Text
        className={
          active
            ? "text-foreground font-body-semibold"
            : "text-muted font-body-medium"
        }
        style={{ fontSize: 14, letterSpacing: -0.1 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
