import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, ScrollView } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  consentQueries,
  useAcceptConsentMutation,
  useRefuseConsentMutation,
} from "@/lib/queries/consent-queries-factory";
import { signOutWithPushCleanup } from "@/lib/sign-out";
import { useSessionAuth } from "@/lib/session-auth";
import { AuthLanguageToggle } from "@/components/auth/auth-language-toggle";
import { DocumentCard } from "@/components/consent/document-card";
import { GuardianBlock, type GuardianFields } from "@/components/consent/guardian-block";
import { StudioButton } from "@/components/ui/studio";
import type { ConsentDocumentKey } from "@baza/types";

export default function ConsentScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lang = i18n.language === "en" ? "en" : "sr";
  const me = useQuery(authQueries.me());
  const status = useQuery(consentQueries.status());
  const session = useSessionAuth();

  const acceptMutation = useAcceptConsentMutation();
  const refuseMutation = useRefuseConsentMutation();

  const isReConsent = (status.data?.pending ?? []).some((p) => p.reason === "outdated");
  const pending = status.data?.pending ?? [];
  const hasMinorWaiver = pending.some((p) => p.key === "waiver_minor");

  const [accepted, setAccepted] = useState<Partial<Record<ConsentDocumentKey, boolean>>>({});
  const [guardian, setGuardian] = useState<GuardianFields>({ name: "", relation: "parent" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set to true after refuse + signout to trigger a session-aware redirect.
  const [refused, setRefused] = useState(false);

  const allAccepted = pending.every((p) => accepted[p.key]);
  const guardianOk = !hasMinorWaiver || guardian.name.trim().length > 0;
  const canSubmit = allAccepted && guardianOk && !submitting;

  // Navigate to /sign-in once the session has cleared after refuse.
  // Better-auth's session signal propagates asynchronously (via a 10 ms
  // setTimeout internally), so we wait for useSession() to confirm null
  // before navigating rather than calling router.replace() immediately after
  // signOutWithPushCleanup(). Without this, Stack.Protected still sees
  // isAuthenticated=true and routes to /(client), causing ConsentGateRedirect
  // to loop back to /consent.
  useEffect(() => {
    if (refused && !session.isPending && !session.data?.session) {
      router.replace("/sign-in");
    }
  }, [refused, session.isPending, session.data, router]);

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
    // Flag that we have refused — the useEffect above will navigate to /sign-in
    // once useSessionAuth() confirms the session has cleared. This avoids the
    // race where Stack.Protected still sees isAuthenticated=true and routes to
    // /(client), causing ConsentGateRedirect to loop back to /consent.
    setRefused(true);
  }

  if (status.isLoading || !me.data) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingTop: 60, paddingBottom: 40, gap: 16 }}>
        <View className="px-6">
          <View className="flex-row justify-end mb-2">
            <AuthLanguageToggle />
          </View>
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 28, letterSpacing: -0.4 }}
          >
            {isReConsent ? t("consent.updateTitle") : t("consent.welcomeTitle")}
          </Text>
          <Text className="text-muted mt-1" style={{ fontSize: 14 }}>
            {isReConsent ? t("consent.updateSubtitle") : t("consent.welcomeSubtitle")}
          </Text>
        </View>

        {pending.map((p) => (
          <DocumentCard
            key={p.key}
            documentKey={p.key}
            locale={lang}
            accepted={!!accepted[p.key]}
            onAcceptedChange={(v) => setAccepted((prev) => ({ ...prev, [p.key]: v }))}
          />
        ))}

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

        {submitError ? (
          <View className="px-6">
            <Text className="text-danger text-[13px]">{submitError}</Text>
          </View>
        ) : null}

        <View className="px-6 gap-2">
          <StudioButton
            testID="consent-submit-button"
            label={t("consent.continue")}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            block
          />
          <Pressable
            onPress={handleRefuse}
            testID="consent-refuse-button"
            accessibilityLabel={t("consent.signOut")}
            disabled={refuseMutation.isPending}
            className={`items-center py-3${refuseMutation.isPending ? " opacity-50" : ""}`}
          >
            <Text className="text-muted text-[13px] underline">{t("consent.signOut")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
