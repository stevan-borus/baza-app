import { Pressable, Text } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";

export function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={null}
      className="flex-row items-center gap-3 py-3.5 active:opacity-70"
    >
      <Icon
        name={icon}
        size={18}
        color={destructive ? "#dc2626" : tokens.foreground}
      />
      <Text
        className={
          destructive
            ? "text-danger font-body-medium flex-1"
            : "text-foreground font-body-medium flex-1"
        }
        style={{ fontSize: 15 }}
      >
        {label}
      </Text>
      {!destructive ? (
        <Icon name="chevron-right" size={16} color={tokens.faint} />
      ) : null}
    </Pressable>
  );
}
