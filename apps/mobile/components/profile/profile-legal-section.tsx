import { useTranslation } from "react-i18next";
import { Pressable, Switch, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ConsentDocumentKey } from "@baza/types";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  consentQueries,
  useRecordSocialMediaMutation,
} from "@/lib/queries/consent-queries-factory";
import { useThemeTokens } from "@/components/ui/tokens";

// Gate documents shown to every authenticated role.
const GATE_KEYS = ["tos", "privacy", "eula"] as const satisfies readonly ConsentDocumentKey[];

// Re-use the existing i18n keys defined for the /consent flow so we
// don't introduce a parallel label scheme.
const LABEL_KEY: Partial<Record<ConsentDocumentKey, string>> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  eula: "consent.documentEula",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
};

export function ProfileLegalSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const meQuery = useQuery(authQueries.me());
  const statusQuery = useQuery(consentQueries.status());
  const socialMutation = useRecordSocialMediaMutation();

  if (!meQuery.data || !statusQuery.data) return null;

  const role = meQuery.data.user.role;
  const isClient = role === "CLIENT";

  // Pick the waiver key best-effort: if a waiver row is pending, render
  // it; otherwise fall back to adult. Mislabelling here only affects the
  // row title — the gate logic lives elsewhere.
  const pendingKeys = new Set(statusQuery.data.pending.map((p) => p.key));
  let waiverKey: ConsentDocumentKey | null = null;
  if (isClient) {
    if (pendingKeys.has("waiver_minor")) waiverKey = "waiver_minor";
    else if (pendingKeys.has("waiver_adult")) waiverKey = "waiver_adult";
    else waiverKey = "waiver_adult";
  }

  const keys: ConsentDocumentKey[] = [...GATE_KEYS];
  if (waiverKey) keys.push(waiverKey);

  const socialOn = statusQuery.data.socialMediaLatestAccepted === true;

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
            onPress={() => router.push(`/legal/${key}` as never)}
            className="flex-row items-center justify-between rounded-xl border border-foreground/15 bg-foreground/5 p-3"
          >
            <Text className="flex-1 text-[14px] text-foreground">{label}</Text>
            <Text
              className={`text-[12px] ${updateNeeded ? "text-warning" : "text-success"}`}
            >
              {updateNeeded ? t("profile.legalUpdateNeeded") : t("profile.legalAccepted")}
            </Text>
          </Pressable>
        );
      })}
      {isClient ? (
        <View
          testID="profile-social-toggle"
          className="mt-3 flex-row items-center justify-between gap-3 rounded-xl border border-foreground/15 bg-foreground/5 p-3"
        >
          <Text className="flex-1 text-[14px] text-foreground">
            {t("profile.socialMediaToggle")}
          </Text>
          <Switch
            testID="profile-social-toggle-switch"
            value={socialOn}
            onValueChange={(next) => socialMutation.mutate({ accepted: next })}
            disabled={socialMutation.isPending}
            trackColor={{ false: tokens.glassStrong, true: tokens.accent }}
          />
        </View>
      ) : null}
    </View>
  );
}
