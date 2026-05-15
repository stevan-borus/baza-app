import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  healthIntakeQueries,
  useRecordHealthIntakeMutation,
  useWithdrawHealthIntakeMutation,
} from "@/lib/queries/health-intake-queries-factory";
import {
  EMPTY_INTAKE,
  HealthIntakeForm,
  type HealthIntakeState,
  intakeToInput,
  isIntakeValid,
} from "@/components/consent/health-intake-form";
import { Button } from "@/components/ui/button";

export function ProfileHealthSection() {
  const { t } = useTranslation();
  const meQuery = useQuery(authQueries.me());
  const isClient = meQuery.data?.user.role === "CLIENT";

  const intakeQuery = useQuery({
    ...healthIntakeQueries.latest(),
    enabled: isClient,
  });
  const recordMutation = useRecordHealthIntakeMutation();
  const withdrawMutation = useWithdrawHealthIntakeMutation();

  // Two-tap confirm for withdrawal: arms on first tap, disarms after 3s,
  // fires the mutation on second tap. The effect is state-driven, not
  // setup — see feedback_no_useeffect_for_setup.
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HealthIntakeState>(EMPTY_INTAKE);
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

  async function handleSave() {
    if (!isIntakeValid(draft, false)) return;
    setError(null);
    try {
      await recordMutation.mutateAsync(intakeToInput(draft));
      setEditing(false);
      setDraft(EMPTY_INTAKE);
    } catch {
      setError(t("intake.saveFailed"));
    }
  }

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

  function startEditing() {
    setDraft(
      intake
        ? {
            isPhysicallyActive: intake.isPhysicallyActive,
            isFirstPilates: intake.isFirstPilates,
            hasComplaints: intake.hasComplaints,
            complaintsDetails: intake.complaintsDetails ?? "",
            hasInjuries: intake.hasInjuries,
            injuriesDetails: intake.injuriesDetails ?? "",
            isPregnant: intake.isPregnant,
            isPostpartum: intake.isPostpartum,
            consented: false, // re-tick on each new record
          }
        : EMPTY_INTAKE,
    );
    setEditing(true);
  }

  return (
    <View testID="profile-health-section" className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-muted text-xs uppercase" style={{ letterSpacing: 0.5 }}>
          {t("profile.healthSection")}
        </Text>
        {!editing && intake ? (
          <Pressable onPress={startEditing} hitSlop={8}>
            <Text className="text-[12px] text-foreground underline">
              {t("profile.healthEdit")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View className="gap-3">
          <HealthIntakeForm
            state={draft}
            onChange={setDraft}
            showConsentCheckbox={false}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                variant="secondary"
                onPress={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                onPress={handleSave}
                disabled={
                  !isIntakeValid(draft, false) || recordMutation.isPending
                }
              >
                {t("intake.save")}
              </Button>
            </View>
          </View>
          {error ? (
            <Text className="text-[12px] text-danger">{error}</Text>
          ) : null}
        </View>
      ) : !intake ? (
        <View className="gap-2">
          <Text className="text-[13px] text-muted leading-5">
            {t("profile.healthEmpty")}
          </Text>
          <Button onPress={startEditing}>{t("profile.healthAdd")}</Button>
        </View>
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
            {!intake.isPregnant &&
            !intake.isPostpartum &&
            !intake.hasComplaints &&
            !intake.hasInjuries ? (
              <Text className="text-[12px] text-muted">
                {t("profile.healthNoFlags")}
              </Text>
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
