/**
 * sign-in.tsx
 *
 * Immersive welcome sign-in screen.
 * Layout: logo (top 30%) → welcome block → glass-panel form → bottom legal strip.
 * Motion: logo fades in, heading slides up, panel slides up with a slight delay.
 * All business logic (signInMutation, redirect, state) is preserved unchanged.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { authClient } from "@/lib/auth-client";

const logoWhite = require("@/assets/images/logo-white.png");

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTo =
    typeof params.redirect === "string" ? params.redirect.trim() : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.email({
        email,
        password,
      });
      if (response.error) {
        throw new Error(response.error.message || "Sign-in failed");
      }
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["auth", "me"] });
      if (
        redirectTo &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//")
      ) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      } else {
        router.replace("/");
      }
    },
  });

  const canSubmit =
    email.length > 0 && password.length > 0 && !signInMutation.isPending;

  return (
    <AuthBackground>
      <View className="flex-1 flex-col">
        {/* ── Top 30%: Logo ── */}
        <View className="items-center justify-end" style={{ height: "30%" }}>
          <MotiView
            from={{ opacity: 0, translateY: -12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 400, delay: 0 }}
          >
            <Image
              source={logoWhite}
              style={{ width: 180, height: 60 }}
              contentFit="contain"
            />
          </MotiView>
        </View>

        {/* ── Welcome block ── */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 150 }}
          className="items-center gap-2 mt-8 mb-6"
        >
          <Text
            className="text-white font-bold text-center"
            style={{ fontSize: 36, letterSpacing: -0.8 }}
          >
            {t("auth.welcomeBack", { defaultValue: "Welcome back" })}
          </Text>
          <Text
            className="text-center"
            style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}
          >
            {t("auth.signInSubtitle", {
              defaultValue: "Sign in to your account",
            })}
          </Text>
        </MotiView>

        {/* ── Glass panel ── */}
        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 300 }}
        >
          <View className="bg-glass border border-glass-border rounded-3xl p-6 gap-4">
            {/* Email */}
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

            {/* Password */}
            <PasswordInput
              label={t("auth.password")}
              value={password}
              onChangeText={setPassword}
              iconColor="rgba(255,255,255,0.5)"
            />

            {/* Forgot password — right-aligned */}
            <View className="items-end">
              <Link href="/reset-password" asChild>
                <LinkText color="rgba(255,255,255,0.6)" fontSize={12}>
                  {t("auth.forgotPassword")}
                </LinkText>
              </Link>
            </View>

            {/* Error state — slide in from top */}
            {signInMutation.isError ? (
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
                <Text
                  style={{ color: "#ef4444", fontSize: 13, fontWeight: "500" }}
                >
                  {t("auth.signInError")}
                </Text>
              </MotiView>
            ) : null}

            {/* Sign in button */}
            <Button
              disabled={!canSubmit}
              onPress={() => signInMutation.mutate()}
              size="large"
              className="mt-2"
            >
              {signInMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {t("auth.submit")}
                </Text>
              )}
            </Button>
          </View>
        </MotiView>

        {/* ── Spacer ── */}
        <View className="flex-1" />

        {/* ── Bottom: version + terms ── */}
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
