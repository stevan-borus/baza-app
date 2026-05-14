import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Switch, Text, View } from "react-native";
import dayjs from "dayjs";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { useMarkGuardianVerifiedMutation } from "@/lib/queries/consent-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

type Props = {
  clientUserId: string;
  lang: "sr" | "en";
};

export function ClientLegalPanel({ clientUserId, lang }: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const recordsQuery = useQuery(clientsQueries.consentRecords(clientUserId));
  const records = recordsQuery.data?.records ?? [];

  const minorWaiver = records.find((r) => r.documentKey === "waiver_minor");
  const guardianMutation = useMarkGuardianVerifiedMutation();

  return (
    <View className="gap-2">
      <SectionLabel>{t("admin.client.legalPanel")}</SectionLabel>
      {records.length === 0 ? (
        <Text className="text-muted">{t("admin.client.legalPanelEmpty")}</Text>
      ) : (
        <GlassCard size="md">
          {records.map((r) => (
            <View key={r.id} className="py-1 flex-row justify-between">
              <Text className="text-foreground">{r.documentKey} v{r.version}</Text>
              <Text className="text-muted text-[12px]">
                {t("admin.client.legalAccepted", {
                  date: dayjs(r.acceptedAt).locale(lang).format("D.M.YYYY."),
                })}
              </Text>
            </View>
          ))}
        </GlassCard>
      )}

      {minorWaiver ? (
        <GlassCard size="md">
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground">{t("admin.client.guardianVerifiedToggle")}</Text>
            <Switch
              testID={`guardian-verified-${clientUserId}`}
              value={!!minorWaiver.guardianVerifiedAt}
              onValueChange={() => guardianMutation.mutate(clientUserId)}
              disabled={!!minorWaiver.guardianVerifiedAt || guardianMutation.isPending}
              accessibilityLabel={t("admin.client.guardianVerifiedToggle")}
              trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
            />
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}
