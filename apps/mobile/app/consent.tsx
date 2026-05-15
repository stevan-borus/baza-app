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
import {
  EMPTY_INTAKE,
  HealthIntakeForm,
  type HealthIntakeState,
  intakeToInput,
  isIntakeValid,
} from "@/components/consent/health-intake-form";
import { SocialMediaQuestion } from "@/components/consent/social-media-question";
import { GuardianBlock, type GuardianFields } from "@/components/consent/guardian-block";
import { DocumentSheet } from "@/components/consent/document-sheet";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";
import { Body, BodyTitle } from "@/components/ui/studio";
import { useRecordHealthIntakeMutation } from "@/lib/queries/health-intake-queries-factory";
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
  const recordIntakeMutation = useRecordHealthIntakeMutation();

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
  const [intake, setIntake] = useState<HealthIntakeState>(EMPTY_INTAKE);
  const [intakeMode, setIntakeMode] = useState<"share" | "skip">("share");
  const [openDoc, setOpenDoc] = useState<ConsentDocumentKey | null>(null);
  const [refused, setRefused] = useState(false);

  const allAccepted = pending.every((p) => accepted[p.key]);
  const guardianOk = !hasMinorWaiver || guardian.name.trim().length > 0;
  const socialAnswered = !isClient || socialChoice !== null;
  const intakeReady =
    !isClient || intakeMode === "skip" || isIntakeValid(intake);
  const canSubmit =
    allAccepted && guardianOk && socialAnswered && intakeReady && !submitting;

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
      if (isClient && intakeMode === "share") {
        await recordIntakeMutation.mutateAsync(intakeToInput(intake));
      }
      for (const p of pending) {
        await acceptMutation.mutateAsync({
          documentKey: p.key,
          version: p.currentVersion,
          locale: lang,
          guardianName: p.key === "waiver_minor" ? guardian.name.trim() : undefined,
          guardianRelation: p.key === "waiver_minor" ? guardian.relation : undefined,
        });
      }
      await queryClient.refetchQueries({ queryKey: ["consent", "status"] });
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

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 40,
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

        {/* Health intake — clients only */}
        {isClient ? (
          <View className="px-6 gap-3">
            <View className="flex-row items-baseline justify-between">
              <BodyTitle>{t("intake.title")}</BodyTitle>
              <Pressable
                testID="intake-toggle-skip"
                onPress={() =>
                  setIntakeMode((m) => (m === "share" ? "skip" : "share"))
                }
                hitSlop={8}
              >
                <Body size={13} className="underline">
                  {intakeMode === "share"
                    ? t("intake.skip")
                    : t("intake.share")}
                </Body>
              </Pressable>
            </View>
            <Body size={13}>{t("intake.notice")}</Body>
            {intakeMode === "share" ? (
              <HealthIntakeForm state={intake} onChange={setIntake} />
            ) : (
              <View className="rounded-xl border border-glass-border bg-glass p-3">
                <Body size={13}>{t("intake.skippedBanner")}</Body>
              </View>
            )}
          </View>
        ) : null}

        {submitError ? (
          <View className="px-6">
            <Text className="text-danger text-[13px]">{submitError}</Text>
          </View>
        ) : null}

        {/* Bottom actions */}
        <View className="px-6 gap-2">
          <Button
            testID="consent-submit-button"
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {t("consent.continue")}
          </Button>
          <Button
            variant="ghost"
            testID="consent-refuse-button"
            onPress={handleRefuse}
            disabled={refuseMutation.isPending}
          >
            {t("consent.signOut")}
          </Button>
        </View>
      </ScrollView>

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
