import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Switch, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ConsentDocumentKey } from "@baza/types";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  consentQueries,
  useRecordSocialMediaMutation,
} from "@/lib/queries/consent-queries-factory";
import { DocumentSheet } from "@/components/consent/document-sheet";
import { useThemeTokens } from "@/components/ui/tokens";

// Gate documents shown to every authenticated role. EULA is intentionally
// not listed — see `GATE_DOCUMENT_KEYS_FOR_ROLE` in lib/legal/versions.ts.
const GATE_KEYS = ["tos", "privacy"] as const satisfies readonly ConsentDocumentKey[];

const LABEL_KEY: Partial<Record<ConsentDocumentKey, string>> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
};

export function ProfileLegalSection() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const lang = i18n.language === "en" ? "en" : "sr";
  const meQuery = useQuery(authQueries.me());
  const statusQuery = useQuery(consentQueries.status());
  const socialMutation = useRecordSocialMediaMutation();

  const serverSocial = statusQuery.data?.socialMediaLatestAccepted === true;
  // Optimistic switch state — `Switch` is controlled, so we render the
  // user's last interaction immediately and reconcile when the server
  // refetch lands. Without this, the toggle visibly stays "on" until the
  // refetch completes, which feels broken on slow connections.
  const [socialOn, setSocialOn] = useState(serverSocial);
  useEffect(() => {
    setSocialOn(serverSocial);
  }, [serverSocial]);

  const [openDoc, setOpenDoc] = useState<ConsentDocumentKey | null>(null);

  if (!meQuery.data || !statusQuery.data) return null;

  const role = meQuery.data.user.role;
  const isClient = role === "CLIENT";

  const pendingKeys = new Set(statusQuery.data.pending.map((p) => p.key));
  let waiverKey: ConsentDocumentKey | null = null;
  if (isClient) {
    if (pendingKeys.has("waiver_minor")) waiverKey = "waiver_minor";
    else if (pendingKeys.has("waiver_adult")) waiverKey = "waiver_adult";
    else waiverKey = "waiver_adult";
  }

  const keys: ConsentDocumentKey[] = [...GATE_KEYS];
  if (waiverKey) keys.push(waiverKey);

  function handleSocialChange(next: boolean) {
    setSocialOn(next);
    socialMutation.mutate({ accepted: next });
  }

  return (
    <View testID="profile-legal-section" className="gap-2">
      <Text className="text-muted text-xs uppercase" style={{ letterSpacing: 0.5 }}>
        {t("profile.legalSection")}
      </Text>
      {keys.map((key) => {
        const updateNeeded = pendingKeys.has(key);
        const labelKey = LABEL_KEY[key];
        const label = labelKey ? t(labelKey) : key;
        return (
          <Pressable
            key={key}
            testID={`profile-legal-row-${key}`}
            onPress={() => setOpenDoc(key)}
            className="flex-row items-center justify-between rounded-xl border border-glass-border bg-glass p-3"
          >
            <Text className="flex-1 text-[14px] text-foreground">{label}</Text>
            <Text
              className={`text-[12px] ${
                updateNeeded ? "text-warning" : "text-success"
              }`}
            >
              {updateNeeded
                ? t("profile.legalUpdateNeeded")
                : t("profile.legalAccepted")}
            </Text>
          </Pressable>
        );
      })}
      {isClient ? (
        <View
          testID="profile-social-toggle"
          className="mt-3 flex-row items-center justify-between gap-3 rounded-xl border border-glass-border bg-glass p-3"
        >
          <Text className="flex-1 text-[14px] text-foreground">
            {t("profile.socialMediaToggle")}
          </Text>
          <Switch
            testID="profile-social-toggle-switch"
            value={socialOn}
            onValueChange={handleSocialChange}
            disabled={socialMutation.isPending}
            trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
          />
        </View>
      ) : null}

      <DocumentSheet
        open={openDoc !== null}
        onOpenChange={(v) => !v && setOpenDoc(null)}
        documentKey={openDoc}
        locale={lang}
        substitutions={{
          fullName: meQuery.data?.user.fullName ?? "",
        }}
      />
    </View>
  );
}
