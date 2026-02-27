import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
} from "react-native-reanimated";
import { Text, Theme, YStack } from "tamagui";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Input, PasswordInput } from "@/components/ui/input";
import { Label, LinkText } from "@/components/ui/typography";
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
            {/* Rich green-tinted dark gradient */}
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

            {/* Logo */}
            <YStack items="center" mb="$2">
              <Animated.View entering={FadeIn.duration(600).springify()}>
                <Image
                  source={logoWhite}
                  style={{ width: 180, height: 60 }}
                  contentFit="contain"
                />
              </Animated.View>
            </YStack>

            {/* Form — borderless, directly on background */}
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <YStack gap="$4">
                <YStack gap="$2">
                  <Label color="#ffffff">{t("auth.email")}</Label>
                  <Input
                    bg="rgba(255,255,255,0.06)"
                    borderColor="transparent"
                    autoCapitalize="none"
                    autoCorrect={false}
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

                <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                  <YStack gap="$2">
                    <Label color="#ffffff">{t("auth.password")}</Label>
                    <PasswordInput
                      bg="rgba(255,255,255,0.06)"
                      borderColor="transparent"
                      value={password}
                      onChangeText={setPassword}
                      placeholderTextColor="$color9"
                      color="#ffffff"
                      style={{ color: "#ffffff" }}
                      iconColor="white"
                    />
                  </YStack>
                </Animated.View>

                <YStack items="flex-end">
                  <Link href="/reset-password" asChild>
                    <LinkText color="#ffffff" fontSize="$2">
                      {t("auth.forgotPassword")}
                    </LinkText>
                  </Link>
                </YStack>

                <YStack gap="$3">
                  <Button
                    disabled={!canSubmit}
                    onPress={() => signInMutation.mutate()}
                    size="large"
                    bg="#2e5b42"
                    rounded={16}
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

                  {signInMutation.isError ? (
                    <Animated.View entering={FadeInDown.duration(300)}>
                      <ErrorState message={t("auth.signInError")} />
                    </Animated.View>
                  ) : null}
                </YStack>
              </YStack>
            </Animated.View>
          </YStack>
        </Theme>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
