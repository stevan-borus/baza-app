import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  consentQueries,
  useAcceptConsentMutation,
  useRecordSocialMediaMutation,
  useRefuseConsentMutation,
} from "@/lib/queries/consent-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { useSessionAuth } from "@/lib/session-auth";
import { SocialMediaQuestion } from "@/components/consent/social-media-question";
import { GuardianBlock, type GuardianFields } from "@/components/consent/guardian-block";
import { DocumentSheet } from "@/components/consent/document-sheet";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { Body } from "@/components/ui/studio";
import type { ConsentDocumentKey } from "@baza/types";

const DOC_LABEL_KEY: Partial<Record<ConsentDocumentKey, string>> = {
  tos: "consent.documentTos",
  privacy: "consent.documentPrivacy",
  eula: "consent.documentEula",
  waiver_adult: "consent.documentWaiverAdult",
  waiver_minor: "consent.documentWaiverMinor",
};

export default function ConsentScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const lang = i18n.language === "en" ? "en" : "sr";
  const me = useQuery(authQueries.me());
  const status = useQuery(consentQueries.status());
  const session = useSessionAuth();

  const acceptMutation = useAcceptConsentMutation();
  const refuseMutation = useRefuseConsentMutation();
  const socialMutation = useRecordSocialMediaMutation();

  const pending = status.data?.pending ?? [];
  const isReConsent = pending.some((p) => p.reason === "outdated");
  const hasMinorWaiver = pending.some((p) => p.key === "waiver_minor");
  const role = me.data?.user.role ?? null;
  const isClient = role === "CLIENT";
  const socialDecided = status.data?.socialMediaDecided ?? false;
  const socialLatest = status.data?.socialMediaLatestAccepted ?? null;

  const [accepted, setAccepted] = useState<Partial<Record<ConsentDocumentKey, boolean>>>({});
  const [guardian, setGuardian] = useState<GuardianFields>({ name: "", relation: "parent" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [socialChoice, setSocialChoice] = useState<"yes" | "no" | null>(
    socialDecided ? (socialLatest ? "yes" : "no") : null,
  );
  const [openDoc, setOpenDoc] = useState<ConsentDocumentKey | null>(null);
  const [refused, setRefused] = useState(false);

  const allAccepted = pending.every((p) => accepted[p.key]);
  const guardianOk = !hasMinorWaiver || guardian.name.trim().length > 0;
  const socialAnswered = !isClient || socialChoice !== null;
  const canSubmit =
    allAccepted && guardianOk && socialAnswered && !submitting;

  // Navigate to /sign-in once the session has cleared after refuse. The
  // session signal propagates asynchronously, so wait for confirmation
  // before routing — otherwise Stack.Protected still sees the old session
  // and ConsentGateRedirect loops back here.
  useEffect(() => {
    if (refused && !session.isPending && !session.data?.session) {
      router.replace("/sign-in");
    }
  }, [refused, session.isPending, session.data, router]);

  async function handleSocialChoice(next: "yes" | "no") {
    setSocialChoice(next);
    try {
      await socialMutation.mutateAsync({ accepted: next === "yes" });
    } catch {
      /* error surface deferred to submit time */
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      for (const p of pending) {
        await acceptMutation.mutateAsync({
          documentKey: p.key,
          version: p.currentVersion,
          locale: lang,
          guardianName: p.key === "waiver_minor" ? guardian.name.trim() : undefined,
          guardianRelation: p.key === "waiver_minor" ? guardian.relation : undefined,
        });
      }
      await queryClient.refetchQueries({ queryKey: consentQueries.status().queryKey });
      router.replace("/");
    } catch {
      setSubmitError(t("consent.errorSubmit"));
      setSubmitting(false);
    }
  }

  async function handleRefuse() {
    await refuseMutation.mutateAsync();
    await signOutWithPushCleanup();
    queryClient.clear();
    setRefused(true);
  }

  if (status.isLoading || !me.data) {
    return <View className="flex-1 bg-background" />;
  }

  const FOOTER_HEIGHT = 64;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + FOOTER_HEIGHT + 32,
          gap: 24,
        }}
      >
        {/* Header */}
        <View className="px-6">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 26, letterSpacing: -0.4, lineHeight: 32 }}
          >
            {isReConsent ? t("consent.updateTitle") : t("consent.welcomeTitle")}
          </Text>
          <Text className="text-muted mt-2" style={{ fontSize: 14, lineHeight: 20 }}>
            {isReConsent ? t("consent.updateSubtitle") : t("consent.welcomeSubtitle")}
          </Text>
        </View>

        {/* Single card for all legal docs */}
        {pending.length > 0 ? (
          <View className="px-6">
            <GlassCard size="md">
              <View className="gap-3">
                {pending.map((p, idx) => {
                  const labelKey = DOC_LABEL_KEY[p.key];
                  const label = labelKey ? t(labelKey) : p.key;
                  return (
                    <View
                      key={p.key}
                      className={
                        idx > 0
                          ? "pt-3 border-t border-glass-border"
                          : ""
                      }
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Body size={15} className="text-foreground">
                            {label}
                          </Body>
                          <Pressable
                            onPress={() => setOpenDoc(p.key)}
                            testID={`document-card-read-${p.key}`}
                            hitSlop={8}
                          >
                            <Body size={12} className="underline mt-0.5">
                              {t("consent.readFullDocument")}
                            </Body>
                          </Pressable>
                        </View>
                        <Switch
                          testID={`document-card-accept-${p.key}`}
                          value={!!accepted[p.key]}
                          onValueChange={(v) =>
                            setAccepted((prev) => ({ ...prev, [p.key]: v }))
                          }
                          accessibilityLabel={t("consent.iAcceptDocument", {
                            document: label,
                          })}
                          trackColor={{
                            false: tokens.glassStrong,
                            true: tokens.accent,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          </View>
        ) : null}

        {/* Guardian block — only for minors */}
        {hasMinorWaiver ? (
          <GuardianBlock
            value={guardian}
            onChange={setGuardian}
            errors={
              guardian.name.trim().length === 0
                ? { name: t("consent.errorGuardianRequired") }
                : undefined
            }
          />
        ) : null}

        {/* Social-media question — clients only, no card wrapper */}
        {isClient ? (
          <View className="px-6">
            <SocialMediaQuestion
              value={socialChoice}
              onChange={handleSocialChoice}
              disabled={socialMutation.isPending}
            />
          </View>
        ) : null}

        {submitError ? (
          <View className="px-6">
            <Text className="text-danger text-[13px]">{submitError}</Text>
          </View>
        ) : null}

      </ScrollView>

      {/* Pinned footer: CTA + sign-out */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: tokens.background,
          borderTopWidth: 1,
          borderTopColor: tokens.glassBorder,
        }}
      >
        <Button
          testID="consent-submit-button"
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {t("consent.continue")}
        </Button>
        <Pressable
          testID="consent-refuse-button"
          onPress={handleRefuse}
          disabled={refuseMutation.isPending}
          hitSlop={8}
          className="items-center justify-center mt-3 h-9"
        >
          <Body size={14} className="text-muted underline">
            {t("consent.signOut")}
          </Body>
        </Pressable>
      </View>

      <DocumentSheet
        open={openDoc !== null}
        onOpenChange={(v) => !v && setOpenDoc(null)}
        documentKey={openDoc}
        locale={lang}
        substitutions={{
          fullName: me.data?.user.fullName ?? "",
          guardianName: hasMinorWaiver ? guardian.name : "",
          guardianRelation: hasMinorWaiver
            ? t(
                guardian.relation === "parent"
                  ? "consent.guardianRelationParent"
                  : "consent.guardianRelationLegal",
              )
            : "",
        }}
      />
    </View>
  );
}
