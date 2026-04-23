import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { MotiView } from "moti";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
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
      <View className="flex-col gap-6 w-full">
        {/* Logo */}
        <View className="items-center mt-[25%]">
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: 600 }}
          >
            <Image
              source={logoWhite}
              style={{ width: 180, height: 60 }}
              contentFit="contain"
            />
          </MotiView>
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
              {t("auth.welcomeBack", { defaultValue: "Welcome back" })}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
              {t("auth.signInSubtitle", { defaultValue: "Sign in to your account" })}
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

            <PasswordInput
              label={t("auth.password")}
              value={password}
              onChangeText={setPassword}
              iconColor="rgba(255,255,255,0.5)"
            />

            <View className="items-end">
              <Link href="/reset-password" asChild>
                <LinkText color="rgba(255,255,255,0.6)" fontSize={12}>
                  {t("auth.forgotPassword")}
                </LinkText>
              </Link>
            </View>

            {signInMutation.isError ? (
              <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 300 }}
              >
                <GlassCard accentBorder="left" accentBorderColor="#ef4444" size="sm">
                  <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "500" }}>
                    {t("auth.signInError")}
                  </Text>
                </GlassCard>
              </MotiView>
            ) : null}

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
      </View>
    </AuthBackground>
  );
}
