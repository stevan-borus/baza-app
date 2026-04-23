/**
 * accept-invite.tsx
 *
 * Celebratory invite-acceptance screen — the user is joining the studio,
 * this should feel special and welcoming, not generic.
 *
 * Layout: absolute back chevron → hero (heading + subtitle) → inviter row →
 *         glass panel (email read-only, name, password, confirm, terms, CTA).
 *
 * Motion: hero fades/scales 0.95→1 (250ms, delay 0), inviter row fade +
 *         translateY 8→0 (delay 150ms), panel fade + translateY 16→0 (delay 300ms).
 *
 * All business logic preserved: token param, useMutation for completeInvite,
 * password mismatch detection, email + name pre-fill from query params.
 */

import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MotiView } from "moti";
import { AuthBackground } from "@/components/auth/auth-background";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { LinkText } from "@/components/ui/typography";
import { ACCENT, ACCENT_LIGHT, DANGER } from "@/components/ui/tokens";
import { sharedEnv } from "@/lib/env.shared";

// ── Inviter avatar: accent-soft circle with single initial ──────────────────
function InviterBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: `${ACCENT}55`,
        borderWidth: 1,
        borderColor: `${ACCENT_LIGHT}66`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: ACCENT_LIGHT,
          fontSize: 13,
          fontWeight: "600",
          lineHeight: 16,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────
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
  const invitedBy = typeof params.invitedBy === "string" ? params.invitedBy : "";

  const [name, setName] = useState(prefillName);
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
          body: JSON.stringify({ token, password, name }),
        },
      );
      if (!response.ok) throw new Error(`Failed (${response.status})`);
      return response.json();
    },
    onSuccess: () => router.replace("/sign-in"),
  });

  const canSubmit =
    token.length > 0 && passwordsMatch && !completeMutation.isPending;

  // ── Invalid token state ────────────────────────────────────────────────────
  if (!token) {
    return (
      <AuthBackground>
        <View className="flex-1 flex-col">
          {/* Back arrow */}
          <View style={{ paddingTop: 8, paddingBottom: 4 }}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <FontAwesome
                name="chevron-left"
                size={18}
                color="rgba(255,255,255,0.7)"
              />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center gap-6">
            {/* Error badge */}
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(239,68,68,0.12)",
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.35)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FontAwesome name="exclamation-triangle" size={24} color={DANGER} />
            </View>

            <Text
              className="text-white font-semibold text-xl text-center"
              style={{ letterSpacing: -0.3 }}
            >
              {t("auth.inviteInvalid", { defaultValue: "Invalid invite link" })}
            </Text>
            <Text
              className="text-center"
              style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}
            >
              {t("auth.inviteInvalidDesc", {
                defaultValue:
                  "This invite link is invalid or has expired.",
              })}
            </Text>
            <LinkText
              color={ACCENT_LIGHT}
              onPress={() => router.replace("/sign-in")}
            >
              {t("auth.backToSignIn")}
            </LinkText>
          </View>
        </View>
      </AuthBackground>
    );
  }

  // ── Main invite screen ─────────────────────────────────────────────────────
  return (
    <AuthBackground>
      <View className="flex-1 flex-col">
        {/* ── Absolute top-left: back chevron ── */}
        <View style={{ paddingTop: 8, paddingBottom: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <FontAwesome
              name="chevron-left"
              size={18}
              color="rgba(255,255,255,0.7)"
            />
          </Pressable>
        </View>

        {/* ── Hero: celebratory heading + subtitle ── */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 250, delay: 0 }}
          style={{ alignItems: "center", marginTop: 32, marginBottom: 16 }}
        >
          <Text
            className="text-white font-bold text-center"
            style={{ fontSize: 34, letterSpacing: -0.8, lineHeight: 40 }}
          >
            {t("auth.welcomeInvite", { defaultValue: "Welcome to Baza" })}
          </Text>
          <Text
            className="text-center"
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 15,
              marginTop: 8,
            }}
          >
            {t("auth.inviteSubtitle", {
              defaultValue: "You've been invited",
            })}
          </Text>
        </MotiView>

        {/* ── Inviter row (only if invitedBy available) ── */}
        {invitedBy ? (
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 150 }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <InviterBadge name={invitedBy} />
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
              {t("auth.invitedBy", {
                defaultValue: "Invited by {{name}}",
                name: invitedBy,
              })}
            </Text>
          </MotiView>
        ) : (
          // Small spacer when no inviter row
          <View style={{ marginBottom: 24 }} />
        )}

        {/* ── Glass panel ── */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400, delay: 300 }}
        >
          <View className="bg-glass border border-glass-border rounded-3xl p-6 gap-4">
            {/* Pre-filled email — read-only, dimmed */}
            {prefillEmail ? (
              <Input
                icon="envelope"
                label={t("auth.email")}
                value={prefillEmail}
                editable={false}
                style={{ opacity: 0.5 }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            ) : null}

            {/* Name input */}
            <Input
              icon="user"
              label={t("auth.yourName", { defaultValue: "Your name" })}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              value={name}
              onChangeText={setName}
            />

            {/* Create password */}
            <PasswordInput
              label={t("auth.createPassword", {
                defaultValue: "Create password",
              })}
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              iconColor="rgba(255,255,255,0.5)"
            />

            {/* Confirm password */}
            <PasswordInput
              label={t("auth.confirmPassword", {
                defaultValue: "Confirm password",
              })}
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={passwordError}
              iconColor="rgba(255,255,255,0.5)"
            />

            {/* Error banner */}
            {completeMutation.isError ? (
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
                  {t("auth.inviteError", {
                    defaultValue:
                      "Could not complete registration. The invite may have expired.",
                  })}
                </Text>
              </MotiView>
            ) : null}

            {/* Terms link */}
            <View className="items-center">
              <Text
                style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}
              >
                {t("auth.termsNotice")}
              </Text>
            </View>

            {/* Join button */}
            <Button
              disabled={!canSubmit}
              onPress={() => completeMutation.mutate()}
              size="large"
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {t("auth.joinButton", { defaultValue: "Join Baza" })}
                </Text>
              )}
            </Button>
          </View>
        </MotiView>

        {/* ── Spacer ── */}
        <View className="flex-1" />

        {/* ── Bottom: legal ── */}
        <View className="items-center gap-1 pb-4">
          <Text
            className="text-center"
            style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}
          >
            v1.0.0
          </Text>
        </View>
      </View>
    </AuthBackground>
  );
}
