import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text, YStack } from "tamagui";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { ACCENT, DANGER } from "@/components/ui/tokens";
import { sharedEnv } from "@/lib/env.shared";

export default function AcceptInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordError =
    confirmPassword.length > 0 && !passwordsMatch
      ? t("auth.passwordsMismatch", { defaultValue: "Passwords don't match" })
      : undefined;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/auth/complete-invite`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password }),
        },
      );
      if (!response.ok) throw new Error(`Failed (${response.status})`);
      return response.json();
    },
    onSuccess: () => router.replace("/sign-in"),
  });

  const canSubmit = token.length > 0 && passwordsMatch && !completeMutation.isPending;

  if (!token) {
    return (
      <AuthBackground>
        <YStack gap="$6" width="100%" items="center">
          <GlassCard
            borderRadius={999}
            width={64}
            height={64}
            items="center"
            justify="center"
            padding={0}
          >
            <FontAwesome name="exclamation-triangle" size={24} color={DANGER} />
          </GlassCard>
          <Text fontSize="$5" fontWeight="600" color="#ffffff" textAlign="center">
            {t("auth.inviteInvalid", { defaultValue: "Invalid invite link" })}
          </Text>
          <Text fontSize="$3" color="rgba(255,255,255,0.5)" textAlign="center">
            {t("auth.inviteInvalidDesc", { defaultValue: "This invite link is invalid or has expired." })}
          </Text>
          <LinkText color="#ffffff" onPress={() => router.replace("/sign-in")}>
            {t("auth.backToSignIn")}
          </LinkText>
        </YStack>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <YStack gap="$6" width="100%">
        {/* Icon */}
        <YStack items="center">
          <GlassCard
            borderRadius={999}
            width={64}
            height={64}
            items="center"
            justify="center"
            padding={0}
          >
            <FontAwesome name="envelope-open" size={24} color={ACCENT} />
          </GlassCard>
        </YStack>

        {/* Heading */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <YStack gap="$2" items="center">
            <Text fontSize={28} fontWeight="700" color="#ffffff" letterSpacing={-0.5}>
              {t("auth.welcomeInvite", { defaultValue: "Welcome to Baza" })}
            </Text>
            <Text fontSize="$3" color="rgba(255,255,255,0.5)" textAlign="center">
              {t("auth.inviteSubtitle", { defaultValue: "Create a password to complete your account." })}
            </Text>
          </YStack>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <YStack gap="$4">
            <PasswordInput
              label={t("auth.createPassword", { defaultValue: "Create password" })}
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              color="#ffffff"
              style={{ color: "#ffffff" }}
              iconColor="rgba(255,255,255,0.5)"
            />

            <PasswordInput
              label={t("auth.confirmPassword", { defaultValue: "Confirm password" })}
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={passwordError}
              color="#ffffff"
              style={{ color: "#ffffff" }}
              iconColor="rgba(255,255,255,0.5)"
            />

            {completeMutation.isError ? (
              <GlassCard accentBorder="left" borderLeftColor="$red10" padding="$3">
                <Text color="$red10" fontSize="$2" fontWeight="500">
                  {t("auth.inviteError", { defaultValue: "Could not complete registration. The invite may have expired." })}
                </Text>
              </GlassCard>
            ) : null}

            <Button
              disabled={!canSubmit}
              onPress={() => completeMutation.mutate()}
              size="large"
              mt="$2"
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text color="#ffffff" fontWeight="600" fontSize="$4">
                  {t("auth.joinButton", { defaultValue: "Join" })}
                </Text>
              )}
            </Button>

            <YStack items="center" mt="$2">
              <LinkText color="rgba(255,255,255,0.4)" fontSize="$1">
                {t("auth.alreadyHaveAccount", { defaultValue: "Already have an account?" })}
              </LinkText>
              <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.replace("/sign-in")}>
                {t("auth.backToSignIn")}
              </LinkText>
            </YStack>
          </YStack>
        </Animated.View>
      </YStack>
    </AuthBackground>
  );
}
