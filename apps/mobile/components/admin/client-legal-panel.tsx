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
  const socialMedia = recordsQuery.data?.socialMedia ?? null;

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

      {/*
       * Social-media consent — read-only signal for admins about to publish
       * photos. We surface the Da/Ne distinctly from "no record" because
       * legacy users who pre-date the consent gate have no row at all,
       * which is not the same as "they said no".
       */}
      <GlassCard size="md">
        <View className="py-1 flex-row items-center justify-between">
          <Text className="flex-1 text-foreground">
            {t("admin.client.socialMediaPanel")}
          </Text>
          <Text
            className={`text-[13px] font-body-semibold ${
              socialMedia === null
                ? "text-muted"
                : socialMedia.accepted
                  ? "text-success"
                  : "text-danger"
            }`}
            testID={`social-media-status-${clientUserId}`}
          >
            {socialMedia === null
              ? t("admin.client.socialMediaUnknown")
              : socialMedia.accepted
                ? t("admin.client.socialMediaYes")
                : t("admin.client.socialMediaNo")}
          </Text>
        </View>
        {socialMedia ? (
          <Text className="text-muted text-[12px] mt-1">
            {t("admin.client.socialMediaSince", {
              date: dayjs(socialMedia.acceptedAt).locale(lang).format("D.M.YYYY."),
            })}
          </Text>
        ) : null}
      </GlassCard>

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
