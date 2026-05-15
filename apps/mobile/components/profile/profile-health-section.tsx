import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  healthIntakeQueries,
  useWithdrawHealthIntakeMutation,
} from "@/lib/queries/health-intake-queries-factory";

export function ProfileHealthSection() {
  const { t } = useTranslation();
  const meQuery = useQuery(authQueries.me());
  // Only clients have health-intake records; admins/trainers would see
  // an irrelevant "no data" message, so we early-return for them.
  const isClient = meQuery.data?.user.role === "CLIENT";

  const intakeQuery = useQuery({
    ...healthIntakeQueries.latest(),
    enabled: isClient,
  });
  const withdrawMutation = useWithdrawHealthIntakeMutation();

  // Two-tap confirm: first tap arms the button (label flips to
  // "Tap again to confirm"), second tap within 3s fires the mutation.
  // The timer effect below is state-driven — NOT initial-state derivation
  // — so it is a legitimate use of useEffect.
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timerRef.current = setTimeout(() => setArmed(false), 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [armed]);

  if (!isClient) return null;
  if (intakeQuery.isLoading) return null;
  const intake = intakeQuery.data;

  async function handleWithdraw() {
    if (!armed) {
      setArmed(true);
      setError(null);
      return;
    }
    try {
      await withdrawMutation.mutateAsync();
      setArmed(false);
    } catch {
      setError(t("profile.healthWithdrawFailed"));
      setArmed(false);
    }
  }

  return (
    <View testID="profile-health-section" className="gap-2">
      <Text className="text-muted text-xs uppercase" style={{ letterSpacing: 0.5 }}>
        {t("profile.healthSection")}
      </Text>
      {!intake ? (
        <Text className="text-[13px] text-muted leading-5">
          {t("profile.healthNone")}
        </Text>
      ) : (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            {intake.isPregnant ? (
              <Chip
                testID="health-flag-pregnant"
                label={t("profile.healthFlags.pregnant")}
              />
            ) : null}
            {intake.isPostpartum ? (
              <Chip
                testID="health-flag-postpartum"
                label={t("profile.healthFlags.postpartum")}
              />
            ) : null}
            {intake.hasComplaints ? (
              <Chip
                testID="health-flag-complaints"
                label={t("profile.healthFlags.complaints")}
              />
            ) : null}
            {intake.hasInjuries ? (
              <Chip
                testID="health-flag-injuries"
                label={t("profile.healthFlags.injuries")}
              />
            ) : null}
          </View>
          <Pressable
            testID="profile-health-withdraw"
            disabled={withdrawMutation.isPending}
            onPress={handleWithdraw}
            className="mt-2 items-center rounded-xl border border-danger/40 bg-danger-soft p-3"
          >
            <Text className="text-[14px] text-danger">
              {armed
                ? t("profile.healthWithdrawConfirm")
                : t("profile.healthWithdraw")}
            </Text>
          </Pressable>
          {error ? (
            <Text className="text-[12px] text-danger">{error}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Chip({ label, testID }: { label: string; testID: string }) {
  return (
    <View
      testID={testID}
      className="rounded-full border border-warning/40 bg-warning-soft px-3 py-1"
    >
      <Text className="text-[12px] text-warning">{label}</Text>
    </View>
  );
}
