import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { MotiView } from "moti";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { PasswordInput } from "@/components/ui/input";
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
        <View className="flex-col gap-6 w-full items-center">
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
            <FontAwesome name="exclamation-triangle" size={24} color={DANGER} />
          </GlassCard>
          <Text
            className="text-white font-semibold text-xl text-center"
          >
            {t("auth.inviteInvalid", { defaultValue: "Invalid invite link" })}
          </Text>
          <Text
            className="text-center"
            style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
          >
            {t("auth.inviteInvalidDesc", { defaultValue: "This invite link is invalid or has expired." })}
          </Text>
          <LinkText color="#ffffff" onPress={() => router.replace("/sign-in")}>
            {t("auth.backToSignIn")}
          </LinkText>
        </View>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <View className="flex-col gap-6 w-full">
        {/* Icon */}
        <View className="items-center">
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
            <FontAwesome name="envelope-open" size={24} color={ACCENT} />
          </GlassCard>
        </View>

        {/* Heading */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 200 }}
        >
          <View className="flex-col gap-2 items-center">
            <Text
              className="text-white font-bold"
              style={{ fontSize: 28, letterSpacing: -0.5 }}
            >
              {t("auth.welcomeInvite", { defaultValue: "Welcome to Baza" })}
            </Text>
            <Text
              className="text-center"
              style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
            >
              {t("auth.inviteSubtitle", { defaultValue: "Create a password to complete your account." })}
            </Text>
          </View>
        </MotiView>

        {/* Form */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 300 }}
        >
          <View className="flex-col gap-4">
            <PasswordInput
              label={t("auth.createPassword", { defaultValue: "Create password" })}
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              iconColor="rgba(255,255,255,0.5)"
            />

            <PasswordInput
              label={t("auth.confirmPassword", { defaultValue: "Confirm password" })}
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={passwordError}
              iconColor="rgba(255,255,255,0.5)"
            />

            {completeMutation.isError ? (
              <GlassCard accentBorder="left" accentBorderColor="#ef4444" size="sm">
                <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "500" }}>
                  {t("auth.inviteError", { defaultValue: "Could not complete registration. The invite may have expired." })}
                </Text>
              </GlassCard>
            ) : null}

            <Button
              disabled={!canSubmit}
              onPress={() => completeMutation.mutate()}
              size="large"
              className="mt-2"
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {t("auth.joinButton", { defaultValue: "Join" })}
                </Text>
              )}
            </Button>

            <View className="flex-col items-center mt-2">
              <LinkText color="rgba(255,255,255,0.4)" fontSize={12}>
                {t("auth.alreadyHaveAccount", { defaultValue: "Already have an account?" })}
              </LinkText>
              <LinkText color="rgba(255,255,255,0.6)" onPress={() => router.replace("/sign-in")}>
                {t("auth.backToSignIn")}
              </LinkText>
            </View>
          </View>
        </MotiView>
      </View>
    </AuthBackground>
  );
}
