import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutLeft,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
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
    <XStack gap="$2" justify="center" mt="$3">
      <YStack
        width={8}
        height={8}
        rounded={4}
        bg={isFirst ? ACCENT : "rgba(255,255,255,0.2)"}
      />
      <YStack
        width={8}
        height={8}
        rounded={4}
        bg={!isFirst ? ACCENT : "rgba(255,255,255,0.2)"}
      />
    </XStack>
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
      <YStack gap="$6" width="100%">
        {/* Back arrow */}
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <FontAwesome name="arrow-left" size={20} color="#ffffff" />
        </Pressable>

        {/* Lock icon badge */}
        <YStack items="center" gap="$2">
          <GlassCard
            borderRadius={999}
            width={64}
            height={64}
            items="center"
            justify="center"
            padding={0}
          >
            <FontAwesome
              name={step === "success" ? "check" : "lock"}
              size={24}
              color={step === "success" ? ACCENT : "rgba(255,255,255,0.7)"}
            />
          </GlassCard>
          {step !== "success" ? <StepDots current={step} /> : null}
        </YStack>

        {/* Success state */}
        {step === "success" ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <YStack gap="$4" items="center">
              <Text fontSize="$5" fontWeight="600" color="#ffffff">
                {t("auth.passwordUpdated", { defaultValue: "Password updated" })}
              </Text>
              <Text fontSize="$3" color="rgba(255,255,255,0.5)" textAlign="center">
                {t("auth.passwordUpdatedDesc", { defaultValue: "You can now sign in with your new password." })}
              </Text>
              <LinkText color="#ffffff" onPress={() => router.replace("/sign-in")}>
                {t("auth.backToSignIn")}
              </LinkText>
            </YStack>
          </Animated.View>
        ) : null}

        {/* Step 1 — Request */}
        {step === "request" ? (
          <Animated.View
            key="request-step"
            entering={FadeInDown.delay(200).duration(500)}
            exiting={FadeOutLeft.duration(300)}
          >
            <YStack gap="$4">
              <YStack gap="$2" items="center">
                <Text fontSize="$5" fontWeight="600" color="#ffffff">
                  {t("auth.resetPasswordTitle")}
                </Text>
                <Text fontSize="$3" color="rgba(255,255,255,0.5)" textAlign="center">
                  {t("auth.resetPasswordIntro")}
                </Text>
              </YStack>

              <Input
                icon="envelope"
                label={t("auth.email")}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                color="#ffffff"
                style={{ color: "#ffffff" }}
              />

              <Button
                disabled={requestMutation.isPending || !email}
                onPress={() => requestMutation.mutate()}
                size="large"
              >
                <Text color="#ffffff" fontWeight="600" fontSize="$4">
                  {t("auth.sendLink")}
                </Text>
              </Button>

              {requestMutation.isError ? (
                <ErrorState message={t("auth.sendLinkError")} />
              ) : null}

              {requestMutation.isSuccess ? (
                <Animated.View entering={FadeInDown.springify()}>
                  <GlassCard padding="$4">
                    <Text color={ACCENT} fontWeight="600" fontSize="$3">
                      {t("auth.resetLinkSent", { email })}
                    </Text>
                  </GlassCard>
                </Animated.View>
              ) : null}

              <YStack items="center" gap="$3">
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => setStep("reset")}>
                  {t("auth.haveToken")}
                </LinkText>
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.back()}>
                  {t("auth.backToSignIn")}
                </LinkText>
              </YStack>
            </YStack>
          </Animated.View>
        ) : null}

        {/* Step 2 — Reset */}
        {step === "reset" ? (
          <Animated.View
            key="reset-step"
            entering={SlideInRight.duration(400).springify()}
            exiting={SlideOutLeft.duration(300)}
          >
            <YStack gap="$4">
              <YStack gap="$2" items="center">
                <Text fontSize="$5" fontWeight="600" color="#ffffff">
                  {t("auth.checkEmail", { defaultValue: "Check your email" })}
                </Text>
                <Text fontSize="$3" color="rgba(255,255,255,0.5)" textAlign="center">
                  {t("auth.resetTokenIntro")}
                </Text>
              </YStack>

              <Input
                label={t("auth.tokenPlaceholder")}
                autoCapitalize="none"
                value={token}
                onChangeText={setToken}
                color="#ffffff"
                style={{ color: "#ffffff" }}
              />

              <PasswordInput
                label={t("auth.newPassword")}
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
                color="#ffffff"
                style={{ color: "#ffffff" }}
                iconColor="rgba(255,255,255,0.5)"
              />

              <Button
                disabled={resetMutation.isPending || !token || !password}
                onPress={() => resetMutation.mutate()}
                size="large"
              >
                <Text color="#ffffff" fontWeight="600" fontSize="$4">
                  {t("auth.resetSubmit")}
                </Text>
              </Button>

              {resetMutation.isError ? (
                <ErrorState message={t("auth.resetError")} />
              ) : null}

              <YStack items="center" gap="$3">
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => setStep("request")}>
                  {t("auth.backToRequest")}
                </LinkText>
                <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.back()}>
                  {t("auth.backToSignIn")}
                </LinkText>
              </YStack>
            </YStack>
          </Animated.View>
        ) : null}
      </YStack>
    </AuthBackground>
  );
}
