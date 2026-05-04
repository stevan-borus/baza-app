/**
 * sign-in.tsx — Studio look, vertically centered.
 *
 * Bone canvas + Baza logo at the top (rendered by AuthBackground).
 * The whole hero+form block is vertically centered between the logo and
 * the bottom legal strip. Utility classes drive theme-tokened colors;
 * inline `style` only carries values that have no Tailwind utility
 * (font sizes / letter-spacing / line-heights).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { StudioButton } from "@/components/ui/studio";
import { authClient } from "@/lib/auth-client";
import { signInInputSchema } from "@baza/types";
import { validateForm, type FormErrors } from "@/lib/zod-form";

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTo =
    typeof params.redirect === "string" ? params.redirect.trim() : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors<{
    email: string;
    password: string;
  }>>({});

  function handleSubmit() {
    const result = validateForm(signInInputSchema, { email, password }, t);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    signInMutation.mutate();
  }

  const signInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.email({ email, password });
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

  return (
    <AuthBackground>
      {/* Centered hero + form. flex-1 + justify-center pushes the block to
          the vertical center between the logo (top) and legal strip (bottom). */}
      <View className="flex-1 justify-center">
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 100 }}
          className="items-center mb-8"
        >
          <Text
            className="font-body-bold text-foreground text-center"
            style={{ fontSize: 30, letterSpacing: -0.6 }}
          >
            {t("auth.welcomeBack")}
          </Text>
          <Text className="font-sans text-sm text-muted text-center mt-1.5">
            {t("auth.signInSubtitle")}
          </Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 220 }}
          className="gap-3.5"
        >
          <Input
            icon="envelope"
            label={t("auth.email")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
            }}
            error={errors.email}
          />

          <PasswordInput
            label={t("auth.password")}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password)
                setErrors((e) => ({ ...e, password: undefined }));
            }}
            error={errors.password}
          />

          <View className="items-end">
            <Link href="/reset-password" asChild>
              <LinkText className="text-muted" fontSize={12}>
                {t("auth.forgotPassword")}
              </LinkText>
            </Link>
          </View>

          {signInMutation.isError ? (
            <MotiView
              from={{ opacity: 0, translateY: -8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 250 }}
              className="bg-danger-soft border border-danger rounded-lg px-3.5 py-2.5"
            >
              <Text className="font-body-medium text-danger text-[13px]">
                {t("auth.signInError")}
              </Text>
            </MotiView>
          ) : null}

          {signInMutation.isPending ? (
            <View className="h-[50px] rounded bg-foreground items-center justify-center mt-1.5">
              <ActivityIndicator color="#FFFFFF" size="small" />
            </View>
          ) : (
            <View className="mt-1.5">
              <StudioButton
                label={t("auth.submit")}
                onPress={handleSubmit}
                block
              />
            </View>
          )}
        </MotiView>
      </View>

      {/* Bottom strip — version + terms */}
      <View className="items-center gap-1 pb-1">
        <Text className="font-sans text-faint text-[11px] text-center">
          v1.0.0
        </Text>
        <Text className="font-sans text-faint text-[11px] text-center">
          {t("auth.termsNotice")}
        </Text>
      </View>
    </AuthBackground>
  );
}
