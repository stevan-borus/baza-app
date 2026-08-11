import { Text, View } from "react-native";
import { useThemeTokens } from "@/components/ui/tokens";

/**
 * One label/value line in a payroll summary card.
 *
 * Shared by the admin per-trainer screen and the trainer's own Zarada, which
 * deliberately show the SAME breakdown: a trainer seeing only the final payout
 * has no way to check the figure they were paid.
 */
export function SummaryRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  const tokens = useThemeTokens();
  return (
    <View className="flex-row items-center justify-between" testID={testID}>
      <Text className="text-sm" style={{ color: tokens.muted }}>
        {label}
      </Text>
      <Text className="text-sm font-medium" style={{ color: tokens.foreground }}>
        {value}
      </Text>
    </View>
  );
}
