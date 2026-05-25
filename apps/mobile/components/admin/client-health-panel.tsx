import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import dayjs from "dayjs";
import { SectionLabel } from "@/components/ui/typography";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

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
            {intake.underMedicalTreatment ? (
              <Block
                isFirst
                label={t("intake.q.underMedicalTreatment")}
                value={t("intake.yes")}
                detail={intake.medicalTreatmentDetails}
              />
            ) : null}

            <Block
              isFirst={!intake.underMedicalTreatment}
              label={t("intake.q.pilatesExperience")}
              value={intake.pilatesExperience
                .map((c) => t(`intake.pilatesExperience.${c}`))
                .join(", ")}
              detail={intake.pilatesExperienceDuration}
            />

            <Block
              label={t("intake.q.activityLevel")}
              value={t(`intake.activityLevel.${intake.activityLevel}`, {
                defaultValue: intake.activityLevel,
              })}
            />

            <Block
              label={t("intake.q.exerciseFrequency")}
              value={t(`intake.exerciseFrequency.${intake.exerciseFrequency}`, {
                defaultValue: intake.exerciseFrequency,
              })}
            />

            {intake.goals.length > 0 || intake.goalsOther ? (
              <Block
                label={t("intake.q.goals")}
                value={[
                  ...intake.goals.map((c) =>
                    t(`intake.goals.${c}`, { defaultValue: c }),
                  ),
                  ...(intake.goalsOther ? [intake.goalsOther] : []),
                ].join(", ")}
              />
            ) : null}

            {intake.discomfortDuring.length > 0 ? (
              <Block
                label={t("intake.q.discomfortDuring")}
                value={intake.discomfortDuring
                  .map((c) =>
                    t(`intake.discomfortDuring.${c}`, { defaultValue: c }),
                  )
                  .join(", ")}
              />
            ) : null}

            {intake.additionalNotes ? (
              <Block
                label={t("intake.q.additionalNotes")}
                value={intake.additionalNotes}
              />
            ) : null}
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
