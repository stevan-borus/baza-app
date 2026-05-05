/**
 * accept-invite.tsx — Studio look, vertically centered.
 */

import { useMutation } from "@tanstack/react-query";
import Feather from "@expo/vector-icons/Feather";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { z } from "zod";
import { MotiView } from "@/components/ui/styled";
import { AuthBackground } from "@/components/auth/auth-background";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { StudioButton } from "@/components/ui/studio";
import { sharedEnv } from "@/lib/env.shared";
import { validateForm, type FormErrors } from "@/lib/zod-form";

function InviterBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View className="w-8 h-8 rounded-full bg-accent-soft items-center justify-center">
      <Text className="font-body-semibold text-accent text-[13px]">
        {initial}
      </Text>
    </View>
  );
}

export default function AcceptInviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    token?: string;
    email?: string;
    name?: string;
    invitedBy?: string;
  }>();

  const token = typeof params.token === "string" ? params.token : "";
  const prefillEmail = typeof params.email === "string" ? params.email : "";
  const prefillName = typeof params.name === "string" ? params.name : "";
  const invitedBy =
    typeof params.invitedBy === "string" ? params.invitedBy : "";

  const [name, setName] = useState(prefillName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors<{
    name: string;
    password: string;
    confirmPassword: string;
  }>>({});

  // Local schema — extends the wire schema with name + matching confirm.
  // Refines emit a "custom" issue we surface on `confirmPassword`.
  const formSchema = z
    .object({
      name: z.string().min(2, t("validation.tooShort", { min: 2 })),
      password: z.string().min(6, t("validation.tooShort", { min: 6 })),
      confirmPassword: z.string().min(6, t("validation.tooShort", { min: 6 })),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });

  function handleSubmit() {
    const result = validateForm(
      formSchema,
      { name, password, confirmPassword },
      t,
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    completeMutation.mutate();
  }

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${sharedEnv.EXPO_PUBLIC_API_URL}/api/auth/complete-invite`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password, name }),
        },
      );
      if (!response.ok) throw new Error(`Failed (${response.status})`);
      return response.json();
    },
    onSuccess: () => router.replace("/sign-in"),
  });


  // Invalid token state
  if (!token) {
    return (
      <AuthBackground showBack>
        <View className="flex-1 items-center justify-center gap-4">
          <View className="w-16 h-16 rounded-full bg-danger-soft border border-danger items-center justify-center">
            <Feather name="alert-triangle" size={24} color="#dc2626" />
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
        <MotiView
          from={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 250 }}
          className="items-center mb-4"
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

        {invitedBy ? (
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 150 }}
            className="flex-row items-center justify-center gap-2 mb-6"
          >
            <InviterBadge name={invitedBy} />
            <Text className="font-sans text-muted text-[13px]">
              {t("auth.invitedBy", { name: invitedBy })}
            </Text>
          </MotiView>
        ) : (
          <View className="mb-6" />
        )}

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 250 }}
          className="gap-3.5"
        >
          {prefillEmail ? (
            <Input
              icon="envelope"
              label={t("auth.email")}
              value={prefillEmail}
              editable={false}
              style={{ opacity: 0.55 }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          ) : null}

          <Input
            icon="user"
            label={t("auth.yourName")}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
            }}
            error={errors.name}
          />

          <PasswordInput
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

          <View className="items-center">
            <Text className="font-sans text-faint text-[11px] text-center">
              {t("auth.termsNotice")}
            </Text>
          </View>

          <View className="mt-1">
            <StudioButton
              label={t("auth.joinButton")}
              onPress={handleSubmit}
              loading={completeMutation.isPending}
              block
            />
          </View>
        </MotiView>
      </View>

      <View className="items-center pb-1">
        <Text className="font-sans text-faint text-[11px]">v1.0.0</Text>
      </View>
    </AuthBackground>
  );
}
