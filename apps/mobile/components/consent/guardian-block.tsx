import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type GuardianFields = {
  name: string;
  relation: "parent" | "legal_guardian";
};

type Props = {
  value: GuardianFields;
  onChange: (next: GuardianFields) => void;
  errors?: { name?: string };
};

export function GuardianBlock({ value, onChange, errors }: Props) {
  const { t } = useTranslation();
  return (
    <View className="px-6 gap-3">
      <GlassCard size="md">
        <Text className="text-[15px] text-foreground font-body-semibold mb-2">
          {t("consent.guardianBlockTitle")}
        </Text>
        <Input
          testID="guardian-name-input"
          label={t("consent.guardianNameLabel")}
          accessibilityLabel={t("consent.guardianNameLabel")}
          value={value.name}
          onChangeText={(name) => onChange({ ...value, name })}
          error={errors?.name}
        />
        <Text className="text-[12px] text-muted mt-3 mb-1">
          {t("consent.guardianRelationLabel")}
        </Text>
        <SegmentedControl<GuardianFields["relation"]>
          value={value.relation}
          onValueChange={(relation) => onChange({ ...value, relation })}
          segments={[
            {
              value: "parent",
              label: t("consent.guardianRelationParent"),
              testID: "guardian-relation-parent",
            },
            {
              value: "legal_guardian",
              label: t("consent.guardianRelationLegal"),
              testID: "guardian-relation-legal",
            },
          ]}
        />
        <Text className="text-[12px] text-muted mt-3">
          {t("consent.guardianPaperNotice")}
        </Text>
      </GlassCard>
    </View>
  );
}
