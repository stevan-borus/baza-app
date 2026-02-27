import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutLeft,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { Text, Theme, YStack } from "tamagui";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input, PasswordInput } from "@/components/ui/input";
import { Label, LinkText } from "@/components/ui/typography";
import { sharedEnv } from "@/lib/env.shared";

const logoWhite = require("@/assets/images/logo-white.png");

type Step = "request" | "reset";

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
    onSuccess: () => router.replace("/sign-in"),
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        <Theme name="dark">
          <StatusBar barStyle="light-content" />
          <YStack
            flex={1}
            px="$6"
            justify="center"
            gap="$6"
            position="relative"
          >
            {/* Same green-tinted dark gradient as sign-in */}
            <LinearGradient
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              colors={[
                "hsla(151, 30%, 5%, 1)",
                "hsla(151, 22%, 10%, 1)",
                "hsla(151, 15%, 5%, 1)",
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />

            {/* Logo + Title */}
            <YStack gap="$3" items="center" mb="$1">
              <Animated.View entering={FadeIn.duration(600).springify()}>
                <Image
                  source={logoWhite}
                  style={{ width: 120, height: 40 }}
                  contentFit="contain"
                />
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                <Text
                  fontSize="$8"
                  fontWeight="800"
                  color="#ffffff"
                  letterSpacing={-0.5}
                >
                  {t("auth.resetPasswordTitle")}
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                <Text fontSize="$3" color="#ffffff" text="center">
                  {step === "request"
                    ? t("auth.resetPasswordIntro")
                    : t("auth.resetTokenIntro")}
                </Text>
              </Animated.View>
            </YStack>

            {/* Step forms — animated transitions */}
            {step === "request" ? (
              <Animated.View
                key="request-step"
                entering={FadeInDown.delay(400).duration(500)}
                exiting={FadeOutLeft.duration(300)}
              >
                <YStack gap="$4">
                  <YStack gap="$2">
                    <Label color="#ffffff">{t("auth.email")}</Label>
                    <Input
                      bg="rgba(255,255,255,0.06)"
                      borderColor="transparent"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      value={email}
                      onChangeText={setEmail}
                      placeholderTextColor="$color9"
                      color="#ffffff"
                      style={{ color: "#ffffff" }}
                    />
                  </YStack>

                  <YStack gap="$3">
                    <Button
                      disabled={requestMutation.isPending || !email}
                      onPress={() => requestMutation.mutate()}
                      size="large"
                      bg="#2e5b42"
                      rounded={16}
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
                        <YStack bg="rgba(74,222,128,0.12)" rounded={16} p="$4">
                          <Text
                            color="#4ade80"
                            fontWeight="600"
                            fontSize="$3"
                          >
                            {t("auth.resetLinkSent", { email })}
                          </Text>
                        </YStack>
                      </Animated.View>
                    ) : null}
                  </YStack>

                  <YStack items="center" gap="$3">
                    <LinkText color="#ffffff" onPress={() => setStep("reset")}>
                      {t("auth.haveToken")}
                    </LinkText>
                    <LinkText color="#ffffff" onPress={() => router.back()}>
                      {t("auth.backToSignIn")}
                    </LinkText>
                  </YStack>
                </YStack>
              </Animated.View>
            ) : (
              <Animated.View
                key="reset-step"
                entering={SlideInRight.duration(400).springify()}
                exiting={SlideOutLeft.duration(300)}
              >
                <YStack gap="$4">
                  <YStack gap="$2">
                    <Label color="#ffffff">
                      {t("auth.tokenPlaceholder")}
                    </Label>
                    <Input
                      bg="rgba(255,255,255,0.06)"
                      borderColor="transparent"
                      autoCapitalize="none"
                      value={token}
                      onChangeText={setToken}
                      placeholderTextColor="$color9"
                      color="#ffffff"
                      style={{ color: "#ffffff" }}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Label color="#ffffff">{t("auth.newPassword")}</Label>
                    <PasswordInput
                      bg="rgba(255,255,255,0.06)"
                      borderColor="transparent"
                      textContentType="newPassword"
                      value={password}
                      onChangeText={setPassword}
                      placeholderTextColor="$color9"
                      color="#ffffff"
                      style={{ color: "#ffffff" }}
                      iconColor="white"
                    />
                  </YStack>

                  <YStack gap="$3">
                    <Button
                      disabled={
                        resetMutation.isPending || !token || !password
                      }
                      onPress={() => resetMutation.mutate()}
                      size="large"
                      bg="#2e5b42"
                      rounded={16}
                    >
                      <Text color="#ffffff" fontWeight="600" fontSize="$4">
                        {t("auth.resetSubmit")}
                      </Text>
                    </Button>

                    {resetMutation.isError ? (
                      <ErrorState message={t("auth.resetError")} />
                    ) : null}
                  </YStack>

                  <YStack items="center" gap="$3">
                    <LinkText
                      color="#ffffff"
                      onPress={() => setStep("request")}
                    >
                      {t("auth.backToRequest")}
                    </LinkText>
                    <LinkText color="#ffffff" onPress={() => router.back()}>
                      {t("auth.backToSignIn")}
                    </LinkText>
                  </YStack>
                </YStack>
              </Animated.View>
            )}
          </YStack>
        </Theme>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
