import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Body, BodyTitle } from "@/components/ui/studio";

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
        <View className="mb-2">
          <BodyTitle>{t("consent.guardianBlockTitle")}</BodyTitle>
        </View>
        <Input
          testID="guardian-name-input"
          label={t("consent.guardianNameLabel")}
          accessibilityLabel={t("consent.guardianNameLabel")}
          value={value.name}
          onChangeText={(name) => onChange({ ...value, name })}
          error={errors?.name}
        />
        <View className="mt-3 mb-1">
          <Body size={12}>{t("consent.guardianRelationLabel")}</Body>
        </View>
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
        <View className="mt-3">
          <Body size={12}>{t("consent.guardianPaperNotice")}</Body>
        </View>
      </GlassCard>
    </View>
  );
}
