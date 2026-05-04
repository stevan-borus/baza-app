/**
 * SectionRow — uppercase tracked section header with an optional ghost action.
 */
import { View } from "react-native";
import { CapsLabel } from "./typography";
import { StudioGhostButton } from "./buttons";

export function SectionRow({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row justify-between items-baseline px-5 mb-3">
      <CapsLabel size={12} tracking={2.4}>
        {title}
      </CapsLabel>
      {action ? (
        <StudioGhostButton label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}
