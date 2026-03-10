import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { Text, YStack } from "tamagui";
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
      <YStack gap="$6" width="100%">
        {/* Logo */}
        <YStack items="center" mt="25%">
          <Animated.View entering={FadeIn.duration(600).springify()}>
            <Image
              source={logoWhite}
              style={{ width: 180, height: 60 }}
              contentFit="contain"
            />
          </Animated.View>
        </YStack>

        {/* Heading */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <YStack gap="$2" items="center">
            <Text fontSize={28} fontWeight="700" color="#ffffff" letterSpacing={-0.5}>
              {t("auth.welcomeBack", { defaultValue: "Welcome back" })}
            </Text>
            <Text fontSize="$3" color="rgba(255,255,255,0.5)">
              {t("auth.signInSubtitle", { defaultValue: "Sign in to your account" })}
            </Text>
          </YStack>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <YStack gap="$4">
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
              color="#ffffff"
              style={{ color: "#ffffff" }}
            />

            <PasswordInput
              label={t("auth.password")}
              value={password}
              onChangeText={setPassword}
              color="#ffffff"
              style={{ color: "#ffffff" }}
              iconColor="rgba(255,255,255,0.5)"
            />

            <YStack items="flex-end">
              <Link href="/reset-password" asChild>
                <LinkText color="rgba(255,255,255,0.6)" fontSize="$2">
                  {t("auth.forgotPassword")}
                </LinkText>
              </Link>
            </YStack>

            {signInMutation.isError ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <GlassCard accentBorder="left" borderLeftColor="$red10" padding="$3">
                  <Text color="$red10" fontSize="$2" fontWeight="500">
                    {t("auth.signInError")}
                  </Text>
                </GlassCard>
              </Animated.View>
            ) : null}

            <Button
              disabled={!canSubmit}
              onPress={() => signInMutation.mutate()}
              size="large"
              mt="$2"
            >
              {signInMutation.isPending ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <ActivityIndicator color="#fff" size="small" />
                </Animated.View>
              ) : (
                <Text color="#ffffff" fontWeight="600" fontSize="$4">
                  {t("auth.submit")}
                </Text>
              )}
            </Button>
          </YStack>
        </Animated.View>
      </YStack>
    </AuthBackground>
  );
}
