/**
 * accept-invite.tsx — Studio look, vertically centered.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { AuthLanguageToggle } from "@/components/auth/auth-language-toggle";
import { GetAppBanner } from "@/components/auth/get-app-banner";
import { PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { StudioButton } from "@/components/ui/studio";
import { apiRequest } from "@/lib/api-request";
import { authClient } from "@/lib/auth-client";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { completeInviteResponseSchema } from "@baza/types/auth";
import { validateForm, type FormErrors } from "@/lib/zod-form";

export default function AcceptInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  // buildInviteUrl emits `?token=` and nothing else — the account's name and
  // email live on the invite row the server reads, not in the link.
  const params = useLocalSearchParams<{ token?: string }>();

  const token = typeof params.token === "string" ? params.token : "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors<{
    password: string;
    confirmPassword: string;
  }>>({});

  // Local schema — extends the wire schema with a matching confirm.
  // Refines emit a "custom" issue we surface on `confirmPassword`.
  const formSchema = z
    .object({
      password: z.string().min(6, t("validation.tooShort", { min: 6 })),
      confirmPassword: z.string().min(6, t("validation.tooShort", { min: 6 })),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });

  function handleSubmit() {
    const result = validateForm(formSchema, { password, confirmPassword }, t);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    completeMutation.mutate();
  }

  // Any failure (status or body, localized banner is generic) just flips
  // isError — same as the old raw-fetch version, but routed through the
  // apiRequest seam so native gets cookie injection and ApiError shaping.
  const completeMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/complete-invite", {
        method: "POST",
        body: { token, password },
        schema: completeInviteResponseSchema,
        errorMessage: "Failed",
      }),
    onSuccess: async (data) => {
      // The account exists and the user just chose these credentials — sign
      // them in through authClient (the only path that persists the session
      // cookie on native) instead of bouncing to /sign-in to retype them.
      // The invite email comes from the response, not URL params, so it is
      // the server-authoritative address the account was created with.
      const signIn = await authClient.signIn.email({
        email: data.user.email,
        password,
      });
      if (signIn.error) {
        // Account creation succeeded but sign-in didn't — fall back to the
        // sign-in screen rather than surfacing a misleading invite error
        // (retrying the invite would 410 on the consumed token).
        router.replace("/sign-in");
        return;
      }
      await queryClient.refetchQueries({ queryKey: authQueries.me().queryKey });
      router.replace("/");
    },
  });


  // Invalid token state
  if (!token) {
    return (
      <AuthBackground showBack>
        <View className="flex-1 items-center justify-center gap-4">
          <View className="w-16 h-16 rounded-full bg-danger-soft border border-danger items-center justify-center">
            <Icon name="alert-triangle" size={24} color="#dc2626" />
          </View>
          <Text
            className="font-body-semibold text-foreground text-center"
            style={{ fontSize: 20, letterSpacing: -0.4 }}
          >
            {t("auth.inviteInvalid")}
          </Text>
          <Text className="font-sans text-muted text-sm text-center">
            {t("auth.inviteInvalidDesc")}
          </Text>
          <LinkText
            className="text-accent"
            onPress={() => router.replace("/sign-in")}
          >
            {t("auth.backToSignIn")}
          </LinkText>
        </View>
      </AuthBackground>
    );
  }

  // Main invite screen — back chevron is rendered in the header by AuthBackground
  return (
    <AuthBackground showBack>
      <View className="flex-1 justify-center">
        <GetAppBanner />
        <MotiView
          from={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 250 }}
          className="items-center mb-10"
        >
          <Text
            className="font-body-bold text-foreground text-center"
            style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 36 }}
          >
            {t("auth.welcomeInvite")}
          </Text>
          <Text className="font-sans text-sm text-muted text-center mt-2">
            {t("auth.inviteSubtitle")}
          </Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 250 }}
          className="gap-3.5"
        >
          <PasswordInput
            testID="invite-password-input"
            label={t("auth.createPassword")}
            textContentType="newPassword"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password)
                setErrors((e) => ({ ...e, password: undefined }));
            }}
            error={errors.password}
          />

          <PasswordInput
            testID="invite-confirm-password-input"
            label={t("auth.confirmPassword")}
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              if (errors.confirmPassword)
                setErrors((e) => ({ ...e, confirmPassword: undefined }));
            }}
            error={errors.confirmPassword}
          />

          {completeMutation.isError ? (
            <MotiView
              from={{ opacity: 0, translateY: -8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: "timing", duration: 250 }}
              className="bg-danger-soft border border-danger rounded-lg px-3.5 py-2.5"
            >
              <Text className="font-body-medium text-danger text-[13px]">
                {t("auth.inviteError")}
              </Text>
            </MotiView>
          ) : null}

          <View className="mt-1">
            <StudioButton
              testID="invite-submit-button"
              label={t("auth.joinButton")}
              onPress={handleSubmit}
              loading={completeMutation.isPending}
              block
            />
          </View>
        </MotiView>
      </View>

      <View className="items-center gap-1 pb-1">
        <View className="flex-row items-center gap-3 flex-wrap justify-center">
          <Link href="/legal/tos" asChild>
            <Pressable
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={t("consent.documentTos")}
            >
              <Text className="font-sans text-faint text-[11px] underline">
                {t("consent.documentTos")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/legal/privacy" asChild>
            <Pressable
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={t("consent.documentPrivacy")}
            >
              <Text className="font-sans text-faint text-[11px] underline">
                {t("consent.documentPrivacy")}
              </Text>
            </Pressable>
          </Link>
          <AuthLanguageToggle />
        </View>
      </View>
    </AuthBackground>
  );
}
