import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Text, Theme, YStack } from "tamagui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { Input, PasswordInput } from "@/components/ui/input";
import { Label, LinkText } from "@/components/ui/typography";
import { sharedEnv } from "@/lib/env.shared";

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
          <YStack
            flex={1}
            bg="#070b12"
            px="$5"
            justify="center"
            gap="$5"
            position="relative"
          >
            <LinearGradient
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              colors={[
                "rgba(255,255,255,0)",
                "rgba(155,155,155,0.08)",
                "rgba(255,255,255,0.1)",
              ]}
              locations={[0, 0.52, 1]}
              start={{ x: 0.04, y: 0.06 }}
              end={{ x: 0.96, y: 0.94 }}
            />
            <YStack gap="$3" items="center" mb="$1">
              <YStack
                width={56}
                height={56}
                rounded={999}
                bg="$color3"
                items="center"
                justify="center"
              >
                <FontAwesome name="lock" size={20} color="#94a3b8" />
              </YStack>
              <Text
                fontSize="$8"
                fontWeight="800"
                color="$color"
                letterSpacing={-0.5}
              >
                {t("auth.resetPasswordTitle")}
              </Text>
              <Text fontSize="$3" color="$color10" text="center">
                {step === "request"
                  ? t("auth.resetPasswordIntro")
                  : t("auth.resetTokenIntro")}
              </Text>
            </YStack>

            <Card bg="$color2" borderColor="$color4">
              {step === "request" ? (
                <YStack gap="$4">
                  <YStack gap="$2">
                    <Label>{t("auth.email")}</Label>
                    <Input
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </YStack>

                  <YStack gap="$3">
                    <Button
                      disabled={requestMutation.isPending || !email}
                      onPress={() => requestMutation.mutate()}
                      size="large"
                    >
                      {t("auth.sendLink")}
                    </Button>

                    {requestMutation.isError ? (
                      <ErrorState message={t("auth.sendLinkError")} />
                    ) : null}

                    {requestMutation.isSuccess ? (
                      <YStack bg="$green3" rounded="$3" p="$4">
                        <Text color="$green10" fontWeight="600" fontSize="$3">
                          {t("auth.resetLinkSent", { email })}
                        </Text>
                      </YStack>
                    ) : null}
                  </YStack>

                  <YStack items="center" gap="$3">
                    <LinkText color="$green10" onPress={() => setStep("reset")}>
                      {t("auth.haveToken")}
                    </LinkText>
                    <LinkText color="$accent10" onPress={() => router.back()}>
                      {t("auth.backToSignIn")}
                    </LinkText>
                  </YStack>
                </YStack>
              ) : (
                <YStack gap="$4">
                  <YStack gap="$2">
                    <Label>{t("auth.tokenPlaceholder")}</Label>
                    <Input
                      autoCapitalize="none"
                      value={token}
                      onChangeText={setToken}
                    />
                  </YStack>

                  <YStack gap="$2">
                    <Label>{t("auth.newPassword")}</Label>
                    <PasswordInput
                      textContentType="newPassword"
                      value={password}
                      onChangeText={setPassword}
                    />
                  </YStack>

                  <YStack gap="$3">
                    <Button
                      disabled={resetMutation.isPending || !token || !password}
                      onPress={() => resetMutation.mutate()}
                      size="large"
                    >
                      {t("auth.resetSubmit")}
                    </Button>

                    {resetMutation.isError ? (
                      <ErrorState message={t("auth.resetError")} />
                    ) : null}
                  </YStack>

                  <YStack items="center" gap="$3">
                    <LinkText
                      color="$green10"
                      onPress={() => setStep("request")}
                    >
                      {t("auth.backToRequest")}
                    </LinkText>
                    <LinkText color="$accent10" onPress={() => router.back()}>
                      {t("auth.backToSignIn")}
                    </LinkText>
                  </YStack>
                </YStack>
              )}
            </Card>
          </YStack>
        </Theme>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

