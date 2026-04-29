/**
 * reset-password.tsx
 *
 * Two-step password-reset flow with glass panel and animated transitions.
 * Layout: absolute back arrow → animated lock badge → step dots → glass panel.
 * Step 1: enter email → "Send reset link".
 * Step 2: enter token + new password → "Reset password".
 * Success: green check badge + "Password updated" + back-to-sign-in link.
 * Motion: badge fades/scales on mount; panel steps crossfade via key={step} (400ms timing).
 * Error states slide in from top inside the panel.
 * All mutations (requestReset, performReset) preserved unchanged.
 */

import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { ACCENT, ACCENT_LIGHT } from "@/components/ui/tokens";
import { sharedEnv } from "@/lib/env.shared";

type Step = "request" | "reset" | "success";

// ── Step progress dots ──────────────────────────────────────────────────────
// Three small circles: step1, step2, success — active dot filled with accent.
function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ["request", "reset", "success"];
  return (
    <View className="flex-row gap-2 justify-center mb-2">
      {steps.map((s) => (
        <View
          key={s}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor:
              s === current ? ACCENT_LIGHT : "rgba(255,255,255,0.18)",
            borderWidth: s === current ? 0 : 1,
            borderColor: "rgba(255,255,255,0.2)",
          }}
        />
      ))}
    </View>
  );
}

// ── Inline error banner (slide from top) ────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 250 }}
      style={{
        backgroundColor: "rgba(239,68,68,0.12)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.4)",
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "500" }}>
        {message}
      </Text>
    </MotiView>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");

  // ── Mutation: request reset link ──────────────────────────────────────────
  const requestMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/auth/request-password-reset`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return response.json();
    },
    onSuccess: () => setStep("reset"),
  });

  // ── Mutation: perform reset ───────────────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/auth/reset-password`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password }),
        },
      );
      if (!response.ok) throw new Error(`Reset failed (${response.status})`);
      return response.json();
    },
    onSuccess: () => setStep("success"),
  });

  const isSuccess = step === "success";

  return (
    <AuthBackground>
      <View className="flex-1 flex-col">
        {/* ── Absolute back arrow (top-left) ── */}
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <FontAwesome name="chevron-left" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* ── Icon badge ── */}
        <MotiView
          from={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 350, delay: 100 }}
          style={{ alignItems: "center", marginTop: 24, marginBottom: 20 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: isSuccess
                ? "rgba(34,197,94,0.15)"
                : "rgba(46,91,66,0.25)",
              borderWidth: 1,
              borderColor: isSuccess
                ? "rgba(34,197,94,0.35)"
                : `${ACCENT}66`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FontAwesome
              name={isSuccess ? "check" : "lock"}
              size={24}
              color={isSuccess ? "#22c55e" : ACCENT_LIGHT}
            />
          </View>
        </MotiView>

        {/* ── Form ── */}
        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 250 }}
          className="gap-4"
        >
          <StepDots current={step} />

          {/* ── Step crossfade wrapper ── */}
          <MotiView
            key={step}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 400 }}
          >
            {/* ── Step 1: Request reset link ── */}
            {step === "request" ? (
              <View className="gap-4">
                <View className="gap-1 items-center mb-2">
                  <Text
                    className="text-white font-body-bold text-center"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {t("auth.resetPasswordTitle")}
                  </Text>
                  <Text
                    className="text-center"
                    style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
                  >
                    {t("auth.resetPasswordIntro")}
                  </Text>
                </View>

                <Input
                  icon="envelope"
                  label={t("auth.email")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />

                {requestMutation.isError ? (
                  <ErrorBanner message={t("auth.sendLinkError")} />
                ) : null}

                <Button
                  disabled={requestMutation.isPending || !email}
                  onPress={() => requestMutation.mutate()}
                  size="large"
                >
                  {requestMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-body-semibold text-base">
                      {t("auth.sendLink")}
                    </Text>
                  )}
                </Button>

                <View className="flex-row items-center justify-center gap-3 mt-2">
                  <LinkText
                    color="rgba(255,255,255,0.6)"
                    onPress={() => setStep("reset")}
                  >
                    {t("auth.haveToken")}
                  </LinkText>
                  <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
                    ·
                  </Text>
                  <LinkText
                    color="rgba(255,255,255,0.6)"
                    onPress={() => router.back()}
                  >
                    {t("auth.backToSignIn")}
                  </LinkText>
                </View>
              </View>
            ) : null}

            {/* ── Step 2: Enter token + new password ── */}
            {step === "reset" ? (
              <View className="gap-4">
                <View className="gap-1 items-center mb-2">
                  <Text
                    className="text-white font-body-bold text-center"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {t("auth.checkEmail", { defaultValue: "Check your email" })}
                  </Text>
                  {email ? (
                    <Text
                      className="text-center"
                      style={{ color: ACCENT_LIGHT, fontSize: 13 }}
                    >
                      {email}
                    </Text>
                  ) : null}
                  <Text
                    className="text-center"
                    style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
                  >
                    {t("auth.resetTokenIntro")}
                  </Text>
                </View>

                <Input
                  label={t("auth.tokenPlaceholder")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={token}
                  onChangeText={setToken}
                />

                <PasswordInput
                  label={t("auth.newPassword")}
                  textContentType="newPassword"
                  value={password}
                  onChangeText={setPassword}
                  iconColor="rgba(255,255,255,0.5)"
                />

                {resetMutation.isError ? (
                  <ErrorBanner message={t("auth.resetError")} />
                ) : null}

                <Button
                  disabled={resetMutation.isPending || !token || !password}
                  onPress={() => resetMutation.mutate()}
                  size="large"
                >
                  {resetMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-body-semibold text-base">
                      {t("auth.resetSubmit")}
                    </Text>
                  )}
                </Button>

                <View className="items-center mt-2">
                  <LinkText
                    color="rgba(255,255,255,0.6)"
                    onPress={() => setStep("request")}
                  >
                    {t("auth.backToRequest")}
                  </LinkText>
                </View>
              </View>
            ) : null}

            {/* ── Success state ── */}
            {step === "success" ? (
              <View className="gap-4 items-center py-4">
                <Text
                  className="text-white font-body-bold text-center"
                  style={{ fontSize: 22, letterSpacing: -0.4 }}
                >
                  {t("auth.passwordUpdated", {
                    defaultValue: "Password updated",
                  })}
                </Text>
                <Text
                  className="text-center"
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
                >
                  {t("auth.passwordUpdatedDesc", {
                    defaultValue:
                      "You can now sign in with your new password.",
                  })}
                </Text>
                <LinkText
                  color={ACCENT_LIGHT}
                  onPress={() => router.replace("/sign-in")}
                >
                  {t("auth.backToSignIn")}
                </LinkText>
              </View>
            ) : null}
          </MotiView>
        </MotiView>

        {/* ── Spacer ── */}
        <View className="flex-1" />

        {/* ── Bottom: version + legal ── */}
        <View className="items-center gap-1 pb-4">
          <Text
            className="text-center"
            style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}
          >
            v1.0.0
          </Text>
          <Text
            className="text-center"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}
          >
            {t("auth.termsNotice")}
          </Text>
        </View>
      </View>
    </AuthBackground>
  );
}
