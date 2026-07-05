/**
 * reset-password.tsx — Studio look, vertically centered.
 */

import { useMutation } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { AuthLanguageToggle } from "@/components/auth/auth-language-toggle";
import { GetAppBanner } from "@/components/auth/get-app-banner";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { StudioButton } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import { apiRequest } from "@/lib/api-request";
import { requestPasswordResetInputSchema, resetPasswordInputSchema } from "@baza/types/auth";
import { validateForm, type FormErrors } from "@/lib/zod-form";

type Step = "request" | "reset" | "success";

function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ["request", "reset", "success"];
  return (
    <View className="flex-row gap-2 justify-center mb-2">
      {steps.map((s) => (
        <View
          key={s}
          className={`w-1.5 h-1.5 rounded-full ${
            s === current ? "bg-accent" : "bg-glass-border"
          }`}
        />
      ))}
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 250 }}
      className="bg-danger-soft border border-danger rounded-lg px-3.5 py-2.5"
    >
      <Text className="font-body-medium text-danger text-[13px]">{message}</Text>
    </MotiView>
  );
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const params = useLocalSearchParams<{ token?: string }>();
  // The token arrives only via the emailed deep link (?token=...); the user
  // never sees or types it. Its presence is also what puts us on the reset
  // step directly — no manual "I have a token" detour.
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const [step, setStep] = useState<Step>(token ? "reset" : "request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestErrors, setRequestErrors] = useState<FormErrors<{
    email: string;
  }>>({});
  const [resetErrors, setResetErrors] = useState<FormErrors<{
    password: string;
  }>>({});

  function handleRequestSubmit() {
    const result = validateForm(
      requestPasswordResetInputSchema,
      { email },
      t,
    );
    if (!result.ok) {
      setRequestErrors(result.errors);
      return;
    }
    setRequestErrors({});
    requestMutation.mutate();
  }

  function handleResetSubmit() {
    const result = validateForm(
      resetPasswordInputSchema,
      { token, password },
      t,
    );
    if (!result.ok) {
      // Token comes from the URL, not a field — only the password is
      // user-editable here, so surface only its error.
      setResetErrors({ password: result.errors.password });
      return;
    }
    setResetErrors({});
    resetMutation.mutate();
  }

  // Both steps surface failures via their localized ErrorBanner on isError —
  // no status/body branching, same as the old raw-fetch version. Routed
  // through the apiRequest seam for cookie injection + ApiError shaping.
  const requestMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/request-password-reset", {
        method: "POST",
        body: { email },
        errorMessage: "Request failed",
      }),
    // No token in hand here — the user proceeds by opening the emailed link,
    // which lands them back on this screen with ?token=... on the reset step.
    onSuccess: () => setRequestSent(true),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token, password },
        errorMessage: "Reset failed",
      }),
    onSuccess: () => setStep("success"),
  });

  const isSuccess = step === "success";

  return (
    <AuthBackground showBack>

      <View className="flex-1 justify-center">
        <GetAppBanner />
        <MotiView
          from={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 350, delay: 80 }}
          className="items-center mb-5"
        >
          <View
            className={`w-14 h-14 rounded-full items-center justify-center ${
              isSuccess ? "bg-success-soft" : "bg-accent-soft"
            }`}
          >
            <Icon
              name={isSuccess ? "check" : "lock"}
              size={22}
              color={isSuccess ? "#16a34a" : tokens.accent}
            />
          </View>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 200 }}
          className="gap-3.5"
        >
          <StepDots current={step} />

          <MotiView
            key={step}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 300 }}
          >
            {/* Step 1: request — enter email to receive the reset link. */}
            {step === "request" && !requestSent ? (
              <View className="gap-3.5">
                <View className="items-center gap-1 mb-1.5">
                  <Text
                    className="font-body-bold text-foreground text-center"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {t("auth.resetPasswordTitle")}
                  </Text>
                  <Text className="font-sans text-muted text-sm text-center">
                    {t("auth.resetPasswordIntro")}
                  </Text>
                </View>

                <Input
                  testID="reset-email-input"
                  icon="envelope"
                  label={t("auth.email")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (requestErrors.email)
                      setRequestErrors((e) => ({ ...e, email: undefined }));
                  }}
                  error={requestErrors.email}
                />

                {requestMutation.isError ? (
                  <ErrorBanner message={t("auth.sendLinkError")} />
                ) : null}

                <StudioButton
                  testID="reset-send-link-button"
                  label={t("auth.sendLink")}
                  onPress={handleRequestSubmit}
                  loading={requestMutation.isPending}
                  block
                />

                <View className="items-center mt-1.5">
                  <LinkText
                    className="text-muted"
                    onPress={() => router.back()}
                  >
                    {t("auth.backToSignIn")}
                  </LinkText>
                </View>
              </View>
            ) : null}

            {/* Request sent — "check your email"; the link carries the token. */}
            {step === "request" && requestSent ? (
              <View className="gap-3.5">
                <View className="items-center gap-1 mb-1.5">
                  <Text
                    className="font-body-bold text-foreground text-center"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {t("auth.checkEmail")}
                  </Text>
                  {email ? (
                    <Text className="font-body-semibold text-accent text-[13px] text-center">
                      {email}
                    </Text>
                  ) : null}
                  <Text className="font-sans text-muted text-sm text-center">
                    {t("auth.resetLinkSentIntro")}
                  </Text>
                </View>

                <View className="items-center mt-1.5">
                  <LinkText
                    className="text-muted"
                    onPress={() => router.back()}
                  >
                    {t("auth.backToSignIn")}
                  </LinkText>
                </View>
              </View>
            ) : null}

            {/* Step 2: reset — reached via the emailed deep link (?token=...).
                The token is taken from the URL, so only the new password is
                asked for here. */}
            {step === "reset" ? (
              <View className="gap-3.5">
                <View className="items-center gap-1 mb-1.5">
                  <Text
                    className="font-body-bold text-foreground text-center"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {t("auth.newPasswordTitle")}
                  </Text>
                  <Text className="font-sans text-muted text-sm text-center">
                    {t("auth.newPasswordIntro")}
                  </Text>
                </View>

                <PasswordInput
                  testID="reset-new-password-input"
                  label={t("auth.newPassword")}
                  textContentType="newPassword"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (resetErrors.password)
                      setResetErrors((e) => ({
                        ...e,
                        password: undefined,
                      }));
                  }}
                  error={resetErrors.password}
                />

                {resetMutation.isError ? (
                  <ErrorBanner message={t("auth.resetError")} />
                ) : null}

                <StudioButton
                  testID="reset-submit-button"
                  label={t("auth.resetSubmit")}
                  onPress={handleResetSubmit}
                  loading={resetMutation.isPending}
                  block
                />

                <View className="items-center mt-1.5">
                  <LinkText
                    className="text-muted"
                    onPress={() => router.replace("/sign-in")}
                  >
                    {t("auth.backToSignIn")}
                  </LinkText>
                </View>
              </View>
            ) : null}

            {/* Success */}
            {step === "success" ? (
              <View className="gap-3.5 items-center py-3">
                <Text
                  className="font-body-bold text-foreground text-center"
                  style={{ fontSize: 22, letterSpacing: -0.4 }}
                >
                  {t("auth.passwordUpdated")}
                </Text>
                <Text className="font-sans text-muted text-sm text-center">
                  {t("auth.passwordUpdatedDesc")}
                </Text>
                <LinkText
                  className="text-accent"
                  onPress={() => router.replace("/sign-in")}
                >
                  {t("auth.backToSignIn")}
                </LinkText>
              </View>
            ) : null}
          </MotiView>
        </MotiView>
      </View>

      <View className="items-center gap-1 pb-1">
        <View className="flex-row items-center gap-3 flex-wrap justify-center">
          <Link href="/legal/tos" asChild>
            <Pressable
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={t("consent.documentTos")}
            >
              <Text className="font-sans text-faint text-[11px] underline">
                {t("consent.documentTos")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/legal/privacy" asChild>
            <Pressable
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={t("consent.documentPrivacy")}
            >
              <Text className="font-sans text-faint text-[11px] underline">
                {t("consent.documentPrivacy")}
              </Text>
            </Pressable>
          </Link>
          <AuthLanguageToggle />
        </View>
      </View>
    </AuthBackground>
  );
}
