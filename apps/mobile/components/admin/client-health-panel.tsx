import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import dayjs from "dayjs";
import { GlassCard } from "@/components/ui/glass-card";
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
        <GlassCard size="md">
          <Text className="text-muted">
            {t("admin.client.healthFlags.withdrawn", {
              date: dayjs(withdrawnAt).locale(lang).format("D.M.YYYY."),
            })}
          </Text>
        </GlassCard>
      ) : !intake ? (
        <GlassCard size="md">
          <Text className="text-muted">{t("admin.client.healthNone")}</Text>
        </GlassCard>
      ) : (
        <GlassCard size="md">
          <View className="gap-2">
            {intake.isPregnant ? (
              <Flag label={t("admin.client.healthFlags.pregnant")} />
            ) : null}
            {intake.isPostpartum ? (
              <Flag label={t("admin.client.healthFlags.postpartum")} />
            ) : null}
            {intake.hasComplaints ? (
              <Flag
                label={t("admin.client.healthFlags.complaints")}
                detail={intake.complaintsDetails}
              />
            ) : null}
            {intake.hasInjuries ? (
              <Flag
                label={t("admin.client.healthFlags.injuries")}
                detail={intake.injuriesDetails}
              />
            ) : null}
            {!intake.isPregnant &&
            !intake.isPostpartum &&
            !intake.hasComplaints &&
            !intake.hasInjuries ? (
              <Text className="text-muted">
                {t("admin.client.healthNoFlags")}
              </Text>
            ) : null}
          </View>
        </GlassCard>
      )}
    </View>
  );
}

function Flag({ label, detail }: { label: string; detail?: string | null }) {
  return (
    <View className="rounded-xl border border-warning/40 bg-warning-soft p-3">
      <Text className="text-[14px] text-foreground font-body-semibold">
        {label}
      </Text>
      {detail ? (
        <Text className="mt-1 text-[12px] text-muted">{detail}</Text>
      ) : null}
    </View>
  );
}
