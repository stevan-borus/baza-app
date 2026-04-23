import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { MotiView } from "moti";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ErrorState } from "@/components/ui/states";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { ACCENT } from "@/components/ui/tokens";
import { sharedEnv } from "@/lib/env.shared";

type Step = "request" | "reset" | "success";

function StepDots({ current }: { current: Step }) {
  const isFirst = current === "request";
  return (
    <View className="flex-row gap-2 justify-center mt-3">
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: isFirst ? ACCENT : "rgba(255,255,255,0.2)",
        }}
      />
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: !isFirst ? ACCENT : "rgba(255,255,255,0.2)",
        }}
      />
    </View>
  );
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");

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

  return (
    <AuthBackground>
      <View className="flex-col gap-6 w-full">
        {/* Back arrow */}
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <FontAwesome name="arrow-left" size={20} color="#ffffff" />
        </Pressable>

        {/* Lock icon badge */}
        <View className="items-center gap-2">
          <GlassCard
            style={{
              borderRadius: 999,
              width: 64,
              height: 64,
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <FontAwesome
              name={step === "success" ? "check" : "lock"}
              size={24}
              color={step === "success" ? ACCENT : "rgba(255,255,255,0.7)"}
            />
          </GlassCard>
          {step !== "success" ? <StepDots current={step} /> : null}
        </View>

        {/* Success state */}
        {step === "success" ? (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400 }}
          >
            <View className="flex-col gap-4 items-center">
              <Text className="text-white font-semibold text-xl">
                {t("auth.passwordUpdated", { defaultValue: "Password updated" })}
              </Text>
              <Text
                className="text-center"
                style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
              >
                {t("auth.passwordUpdatedDesc", { defaultValue: "You can now sign in with your new password." })}
              </Text>
              <LinkText color="#ffffff" onPress={() => router.replace("/sign-in")}>
                {t("auth.backToSignIn")}
              </LinkText>
            </View>
          </MotiView>
        ) : null}

        {/* Step 1 — Request */}
        {step === "request" ? (
          <MotiView
            key="request-step"
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 500, delay: 200 }}
          >
            <View className="flex-col gap-4">
              <View className="flex-col gap-2 items-center">
                <Text className="text-white font-semibold text-xl">
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
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />

              <Button
                disabled={requestMutation.isPending || !email}
                onPress={() => requestMutation.mutate()}
                size="large"
              >
                <Text className="text-white font-semibold text-base">
                  {t("auth.sendLink")}
                </Text>
              </Button>

              {requestMutation.isError ? (
                <ErrorState message={t("auth.sendLinkError")} />
              ) : null}

              {requestMutation.isSuccess ? (
                <MotiView
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: "spring" }}
                >
                  <GlassCard size="md">
                    <Text style={{ color: ACCENT, fontWeight: "600", fontSize: 14 }}>
                      {t("auth.resetLinkSent", { email })}
                    </Text>
                  </GlassCard>
                </MotiView>
              ) : null}

              <View className="flex-col items-center gap-3">
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => setStep("reset")}>
                  {t("auth.haveToken")}
                </LinkText>
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.back()}>
                  {t("auth.backToSignIn")}
                </LinkText>
              </View>
            </View>
          </MotiView>
        ) : null}

        {/* Step 2 — Reset */}
        {step === "reset" ? (
          <MotiView
            key="reset-step"
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "spring", duration: 400 }}
          >
            <View className="flex-col gap-4">
              <View className="flex-col gap-2 items-center">
                <Text className="text-white font-semibold text-xl">
                  {t("auth.checkEmail", { defaultValue: "Check your email" })}
                </Text>
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

              <Button
                disabled={resetMutation.isPending || !token || !password}
                onPress={() => resetMutation.mutate()}
                size="large"
              >
                <Text className="text-white font-semibold text-base">
                  {t("auth.resetSubmit")}
                </Text>
              </Button>

              {resetMutation.isError ? (
                <ErrorState message={t("auth.resetError")} />
              ) : null}

              <View className="flex-col items-center gap-3">
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => setStep("request")}>
                  {t("auth.backToRequest")}
                </LinkText>
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.back()}>
                  {t("auth.backToSignIn")}
                </LinkText>
              </View>
            </View>
          </MotiView>
        ) : null}
      </View>
    </AuthBackground>
  );
}
