import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import dayjs from "dayjs";
import type { ConsentDocumentKey } from "@baza/types/consent";
import { SectionLabel } from "@/components/ui/typography";
import { SwitchRow } from "@/components/ui/switch-row";
import { useMarkGuardianVerifiedMutation } from "@/lib/queries/consent-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { DocumentSheet } from "@/components/consent/document-sheet";

type Props = {
  clientUserId: string;
  clientFullName: string;
  lang: "sr" | "en";
};

const ROW_KEYS = ["tos", "privacy", "waiver_adult", "waiver_minor"] as const satisfies readonly ConsentDocumentKey[];

const LABEL_KEY: Partial<Record<ConsentDocumentKey, string>> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
};

export function ClientLegalPanel({ clientUserId, clientFullName, lang }: Props) {
  const { t } = useTranslation();
  const recordsQuery = useQuery(clientsQueries.consentRecords(clientUserId));
  const records = recordsQuery.data?.records ?? [];
  const socialMedia = recordsQuery.data?.socialMedia ?? null;

  const acceptedByKey = new Map(records.map((r) => [r.documentKey, r] as const));
  const minorWaiver = acceptedByKey.get("waiver_minor");
  const hasMinor = !!minorWaiver;

  // Show waiver_minor only when there's actually a minor record; otherwise
  // we surface waiver_adult. The two are mutually exclusive per client.
  const visibleKeys: ConsentDocumentKey[] = ["tos", "privacy", hasMinor ? "waiver_minor" : "waiver_adult"];

  const guardianMutation = useMarkGuardianVerifiedMutation();
  // Optimistic toggle: marking the paper signature as collected is a one-way
  // action (server only sets, never clears). Flip the local state on tap so
  // the Switch animates instantly; reconcile from the refetched server value
  // once the mutation resolves.
  const serverVerified = !!minorWaiver?.guardianVerifiedAt;
  const [optimisticVerified, setOptimisticVerified] = useState(false);
  const guardianVerified = serverVerified || optimisticVerified;

  const [openDoc, setOpenDoc] = useState<ConsentDocumentKey | null>(null);

  const rowClass = "flex-row items-center justify-between h-12";

  return (
    <View className="gap-2">
      <SectionLabel>{t("admin.client.legalPanel")}</SectionLabel>
      <View>
        {visibleKeys.map((key, idx) => {
          const accepted = acceptedByKey.get(key);
          const labelKey = LABEL_KEY[key];
          const label = labelKey ? t(labelKey) : key;
          return (
            <Pressable
              key={key}
              testID={`admin-legal-row-${key}`}
              onPress={() => setOpenDoc(key)}
              className={`${rowClass} ${idx === 0 ? "" : "border-t border-glass-border"} active:opacity-60`}
            >
              <Text className="flex-1 text-[14px] text-foreground">{label}</Text>
              <Text
                className={`text-[12px] ${accepted ? "text-success" : "text-muted"}`}
              >
                {accepted
                  ? t("admin.client.legalAcceptedShort", {
                      date: dayjs(accepted.acceptedAt).locale(lang).format("D.M.YYYY."),
                    })
                  : t("admin.client.legalNotAccepted")}
              </Text>
            </Pressable>
          );
        })}

        <View
          testID={`social-media-row-${clientUserId}`}
          className={`${rowClass} border-t border-glass-border`}
        >
          <Text className="flex-1 text-[14px] text-foreground">
            {t("admin.client.socialMediaPanel")}
          </Text>
          <Text
            className={`text-[12px] font-body-semibold ${
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

        {minorWaiver ? (
          <View
            testID={`guardian-verified-row-${clientUserId}`}
            className="h-12 justify-center border-t border-glass-border"
          >
            <SwitchRow
              testID={`guardian-verified-${clientUserId}`}
              label={t("admin.client.guardianVerifiedToggle")}
              value={guardianVerified}
              onValueChange={() => {
                if (guardianVerified) return;
                setOptimisticVerified(true);
                guardianMutation.mutate(clientUserId);
              }}
              disabled={guardianVerified || guardianMutation.isPending}
            />
          </View>
        ) : null}
      </View>

      <DocumentSheet
        open={openDoc !== null}
        onOpenChange={(v) => !v && setOpenDoc(null)}
        documentKey={openDoc}
        locale={lang}
        substitutions={{ fullName: clientFullName }}
      />
    </View>
  );
}
