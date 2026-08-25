import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import dayjs from "dayjs";
import { SectionLabel } from "@/components/ui/typography";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import type { HealthIntakeResponse } from "@baza/types/health-intake";

type Props = {
  clientUserId: string;
  lang: "sr" | "en";
};

export function ClientHealthPanel({ clientUserId, lang }: Props) {
  const { t } = useTranslation();
  const healthQuery = useQuery(clientsQueries.health(clientUserId));
  if (healthQuery.isLoading) return null;

  const { intake, withdrawnAt } = healthQuery.data ?? {
    intake: null,
    withdrawnAt: null,
  };

  const blocks = intake ? buildBlocks(intake, t) : [];

  return (
    <View testID="client-health-panel" className="gap-2">
      <SectionLabel>{t("admin.client.healthSection")}</SectionLabel>
      {withdrawnAt ? (
        <Text className="text-muted text-[13px]">
          {t("admin.client.healthFlags.withdrawn", {
            date: dayjs(withdrawnAt).locale(lang).format("D.M.YYYY."),
          })}
        </Text>
      ) : !intake ? (
        <Text className="text-muted text-[13px]">{t("admin.client.healthNone")}</Text>
      ) : (
        <View className="gap-4">
          <ConditionChips
            codes={intake.conditions}
            other={intake.conditionsOther}
            t={t}
            emptyLabel={t("admin.client.healthNoFlags")}
          />

          <View>
            {blocks.map((block, idx) => (
              <Block
                key={block.key}
                isFirst={idx === 0}
                label={block.label}
                value={block.value}
                detail={block.detail}
              />
            ))}
          </View>

          <Text className="text-[11px] text-muted">
            {t("admin.client.healthFlags.recordedAt", {
              date: dayjs(intake.recordedAt).locale(lang).format("D.M.YYYY."),
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

type BlockData = {
  key: string;
  label: string;
  value: string;
  detail?: string | null;
};

/**
 * Only the medical-treatment answer is guaranteed present — every other field
 * is optional for the client, so a block is built only when it has a value.
 * Returning one flat list keeps the top-border logic honest: whichever block
 * lands at index 0 is the first one drawn.
 */
function buildBlocks(intake: HealthIntakeResponse, t: TFn): BlockData[] {
  const blocks: BlockData[] = [];

  if (intake.underMedicalTreatment) {
    blocks.push({
      key: "underMedicalTreatment",
      label: t("intake.q.underMedicalTreatment"),
      value: t("intake.yes"),
      detail: intake.medicalTreatmentDetails,
    });
  }

  if (intake.pilatesExperience.length > 0) {
    blocks.push({
      key: "pilatesExperience",
      label: t("intake.q.pilatesExperience"),
      value: intake.pilatesExperience
        .map((c) => t(`intake.pilatesExperience.${c}`, { defaultValue: c }))
        .join(", "),
      detail: intake.pilatesExperienceDuration,
    });
  }

  if (intake.activityLevel) {
    blocks.push({
      key: "activityLevel",
      label: t("intake.q.activityLevel"),
      value: t(`intake.activityLevel.${intake.activityLevel}`, {
        defaultValue: intake.activityLevel,
      }),
    });
  }

  if (intake.exerciseFrequency) {
    blocks.push({
      key: "exerciseFrequency",
      label: t("intake.q.exerciseFrequency"),
      value: t(`intake.exerciseFrequency.${intake.exerciseFrequency}`, {
        defaultValue: intake.exerciseFrequency,
      }),
    });
  }

  if (intake.goals.length > 0 || intake.goalsOther) {
    blocks.push({
      key: "goals",
      label: t("intake.q.goals"),
      value: [
        ...intake.goals.map((c) => t(`intake.goals.${c}`, { defaultValue: c })),
        ...(intake.goalsOther ? [intake.goalsOther] : []),
      ].join(", "),
    });
  }

  if (intake.discomfortDuring.length > 0) {
    blocks.push({
      key: "discomfortDuring",
      label: t("intake.q.discomfortDuring"),
      value: intake.discomfortDuring
        .map((c) => t(`intake.discomfortDuring.${c}`, { defaultValue: c }))
        .join(", "),
    });
  }

  if (intake.additionalNotes) {
    blocks.push({
      key: "additionalNotes",
      label: t("intake.q.additionalNotes"),
      value: intake.additionalNotes,
    });
  }

  return blocks;
}

function ConditionChips({
  codes,
  other,
  t,
  emptyLabel,
}: {
  codes: string[];
  other: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
  emptyLabel: string;
}) {
  if (codes.length === 0 && !other) {
    return <Text className="text-muted">{emptyLabel}</Text>;
  }
  return (
    <View className="flex-row flex-wrap gap-2">
      {codes.map((code) => (
        <View
          key={code}
          className="rounded-full border border-warning/40 bg-warning-soft px-3 py-1"
        >
          <Text className="text-[12px] text-warning font-body-semibold">
            {t(`intake.conditions.${code}`, { defaultValue: code })}
          </Text>
        </View>
      ))}
      {other ? (
        <View className="rounded-full border border-warning/40 bg-warning-soft px-3 py-1">
          <Text className="text-[12px] text-warning font-body-semibold">
            {other}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Block({
  label,
  value,
  detail,
  isFirst,
}: {
  label: string;
  value: string;
  detail?: string | null;
  isFirst?: boolean;
}) {
  return (
    <View
      className={`py-3 ${isFirst ? "" : "border-t border-glass-border"}`}
    >
      <Text className="text-[11px] text-muted uppercase" style={{ letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text className="mt-0.5 text-[14px] text-foreground">{value}</Text>
      {detail ? (
        <Text className="mt-0.5 text-[12px] text-muted">{detail}</Text>
      ) : null}
    </View>
  );
}
