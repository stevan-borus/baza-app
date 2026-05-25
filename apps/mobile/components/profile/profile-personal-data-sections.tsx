/**
 * Three "your data" sections shown on the client profile tab, between
 * Moji paketi and Istorija treninga. Visual language matches the rest
 * of the profile: hairline list rows, no card chrome.
 *
 * - Pravna dokumenta: list of the legal docs, each opens DocumentSheet.
 *   Shows an "Update needed" pill when status.pending contains that key.
 * - Fotografije i video: inline Switch row for social-media consent.
 * - Zdravstveni podaci: status + chevron, pushes to /(client)/profile/health.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Feather from "@expo/vector-icons/Feather";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  consentQueries,
  useRecordSocialMediaMutation,
} from "@/lib/queries/consent-queries-factory";
import { healthIntakeQueries } from "@/lib/queries/health-intake-queries-factory";
import { DocumentSheet } from "@/components/consent/document-sheet";
import { SectionRow } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import type { ConsentDocumentKey } from "@baza/types";

const LEGAL_DOC_KEYS: ConsentDocumentKey[] = ["tos", "privacy", "waiver_adult"];

const LEGAL_DOC_LABEL_KEY: Record<ConsentDocumentKey, string> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  eula: "consent.documentEula",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
  social_media: "consent.documentTos", // unused here
  health_intake: "consent.documentTos", // unused here
};

export function ProfilePersonalDataSections() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const tokens = useThemeTokens();
  const me = useQuery(authQueries.me());
  const status = useQuery(consentQueries.status());
  const intakeQuery = useQuery(healthIntakeQueries.latest());
  const socialMutation = useRecordSocialMediaMutation();

  const [openDoc, setOpenDoc] = useState<ConsentDocumentKey | null>(null);

  if (me.data?.user.role !== "CLIENT") return null;

  const pendingKeys = new Set(
    (status.data?.pending ?? []).map((p) => p.key),
  );
  const socialAllowed = status.data?.socialMediaLatestAccepted === true;
  const hasIntake = !!intakeQuery.data;

  return (
    <View className="gap-7">
      {/* ─── FOTOGRAFIJE I VIDEO ──────────────────────────────────── */}
      <View>
        <SectionRow title={t("profile.photoSection")} />
        <View className="mx-4 border-t border-glass-border">
          <View className="flex-row items-center justify-between py-4">
            <View className="flex-1 pr-3">
              <Text
                className="font-body-medium text-foreground"
                style={{ fontSize: 15, letterSpacing: -0.1 }}
              >
                {t("profile.socialMediaToggle")}
              </Text>
              <Text className="text-muted text-[12px] mt-0.5">
                {socialAllowed
                  ? t("profile.photoAllowed")
                  : t("profile.photoDisallowed")}
              </Text>
            </View>
            <Switch
              testID="profile-social-media-toggle"
              value={socialAllowed}
              disabled={status.isLoading}
              onValueChange={(v) =>
                socialMutation.mutate({ accepted: v })
              }
              trackColor={{
                false: tokens.glassStrong,
                true: tokens.accent,
              }}
            />
          </View>
        </View>
      </View>

      {/* ─── ZDRAVSTVENI PODACI ───────────────────────────────────── */}
      <View>
        <SectionRow title={t("profile.healthSection")} />
        <View className="mx-4 border-t border-glass-border">
          <Pressable
            testID="profile-health-row"
            onPress={() => router.push("/(client)/profile/health")}
            android_ripple={null}
            className="flex-row items-center justify-between py-4 active:opacity-60"
          >
            <Text
              className="font-body-medium text-foreground flex-1 pr-3"
              style={{ fontSize: 15, letterSpacing: -0.1 }}
            >
              {hasIntake
                ? t("profile.healthStatusFilled")
                : t("profile.healthStatusMissing")}
            </Text>
            <Feather name="chevron-right" size={16} color={tokens.faint} />
          </Pressable>
        </View>
      </View>

      {/* ─── PRAVNA DOKUMENTA ─────────────────────────────────────── */}
      <View>
        <SectionRow title={t("profile.legalSection")} />
        <View className="mx-4 border-t border-glass-border">
          {LEGAL_DOC_KEYS.map((key) => {
            const needsUpdate = pendingKeys.has(key);
            return (
              <Pressable
                key={key}
                testID={`profile-legal-${key}`}
                onPress={() => setOpenDoc(key)}
                android_ripple={null}
                className="flex-row items-center justify-between py-4 border-b border-glass-border active:opacity-60"
              >
                <Text
                  className="font-body-medium text-foreground flex-1 pr-3"
                  style={{ fontSize: 15, letterSpacing: -0.1 }}
                  numberOfLines={1}
                >
                  {t(LEGAL_DOC_LABEL_KEY[key])}
                </Text>
                <View className="flex-row items-center gap-2">
                  {needsUpdate ? (
                    <View className="rounded-full bg-warning-soft px-2 py-0.5">
                      <Text
                        className="text-warning text-[11px] font-body-medium"
                      >
                        {t("profile.legalUpdateNeeded")}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-faint text-[13px]">
                      {t("profile.legalView")}
                    </Text>
                  )}
                  <Feather name="chevron-right" size={16} color={tokens.faint} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <DocumentSheet
        open={openDoc !== null}
        onOpenChange={(v) => !v && setOpenDoc(null)}
        documentKey={openDoc}
        locale={lang}
        substitutions={{
          fullName: me.data?.user.fullName ?? "",
        }}
      />
    </View>
  );
}
