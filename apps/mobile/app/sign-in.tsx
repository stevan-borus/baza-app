import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
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
import { authClient } from "@/lib/auth-client";

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
              <Text
                fontSize="$8"
                fontWeight="800"
                color="$color"
                letterSpacing={-0.6}
              >
                {t("auth.signIn")}
              </Text>
            </YStack>

            <Card bg="$color2" borderColor="$color4">
              <YStack gap="$4">
                <YStack gap="$2">
                  <Label>{t("auth.email")}</Label>
                  <Input
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    value={email}
                    onChangeText={setEmail}
                  />
                </YStack>

                <YStack gap="$2">
                  <Label>{t("auth.password")}</Label>
                  <PasswordInput value={password} onChangeText={setPassword} />
                </YStack>

                <YStack items="flex-end">
                  <Link href="/reset-password" asChild>
                    <LinkText color="$accent10">
                      {t("auth.forgotPassword")}
                    </LinkText>
                  </Link>
                </YStack>

                <YStack gap="$3">
                  <Button
                    disabled={!canSubmit}
                    onPress={() => signInMutation.mutate()}
                    size="large"
                  >
                    {signInMutation.isPending
                      ? t("auth.signingIn")
                      : t("auth.submit")}
                  </Button>

                  {signInMutation.isError ? (
                    <ErrorState message={t("auth.signInError")} />
                  ) : null}
                </YStack>
              </YStack>
            </Card>
          </YStack>
        </Theme>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

