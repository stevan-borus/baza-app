/**
 * Health info — full screen the client opens from the profile sheet to
 * record, edit, or withdraw their health-intake answers.
 *
 * Layout: the form is always editable, prefilled from the latest intake
 * when one exists. "Withdraw consent" lives at the very bottom of the
 * scrolled form (Settings-style: destructive actions at the end), so it
 * doesn't compete with content. The sticky "Save changes" footer appears
 * only when the draft diverges from the saved record, and a successful save
 * pops back to the profile.
 */
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";
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
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { KEYBOARD_BOTTOM_OFFSET } from "@/lib/keyboard-offset";
import type { HealthIntakeResponse } from "@baza/types/health-intake";

const ARM_TIMEOUT_MS = 3000;

function intakeToState(intake: HealthIntakeResponse): HealthIntakeState {
  return {
    conditions: intake.conditions,
    conditionsOther: intake.conditionsOther ?? "",
    underMedicalTreatment: intake.underMedicalTreatment,
    medicalTreatmentDetails: intake.medicalTreatmentDetails ?? "",
    pilatesExperience: intake.pilatesExperience,
    pilatesExperienceDuration: intake.pilatesExperienceDuration ?? "",
    activityLevel: intake.activityLevel ?? null,
    exerciseFrequency: intake.exerciseFrequency ?? null,
    goals: intake.goals,
    goalsOther: intake.goalsOther ?? "",
    discomfortDuring: intake.discomfortDuring,
    additionalNotes: intake.additionalNotes ?? "",
    consented: false,
  };
}

function statesEqual(a: HealthIntakeState, b: HealthIntakeState): boolean {
  return (
    arraysEqual(a.conditions, b.conditions) &&
    a.conditionsOther.trim() === b.conditionsOther.trim() &&
    a.underMedicalTreatment === b.underMedicalTreatment &&
    a.medicalTreatmentDetails.trim() === b.medicalTreatmentDetails.trim() &&
    arraysEqual(a.pilatesExperience, b.pilatesExperience) &&
    a.pilatesExperienceDuration.trim() === b.pilatesExperienceDuration.trim() &&
    a.activityLevel === b.activityLevel &&
    a.exerciseFrequency === b.exerciseFrequency &&
    arraysEqual(a.goals, b.goals) &&
    a.goalsOther.trim() === b.goalsOther.trim() &&
    arraysEqual(a.discomfortDuring, b.discomfortDuring) &&
    a.additionalNotes.trim() === b.additionalNotes.trim()
  );
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export default function ClientProfileHealth() {
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding(24);

  const meQuery = useQuery(authQueries.me());
  const isClient = meQuery.data?.user.role === "CLIENT";

  const intakeQuery = useQuery({
    ...healthIntakeQueries.latest(),
    enabled: isClient,
  });
  const recordMutation = useRecordHealthIntakeMutation();
  const withdrawMutation = useWithdrawHealthIntakeMutation();

  const intake = intakeQuery.data;
  const baseline = intake ? intakeToState(intake) : EMPTY_INTAKE;

  const [draft, setDraft] = useState<HealthIntakeState>(baseline);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const lastIntakeId = useRef<string | null>(intake?.id ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reseed the draft when the underlying record changes (initial load,
  // after save, after withdraw). Keyed on intake.id so unrelated refetches
  // don't clobber in-flight edits.
  const currentIntakeId = intake?.id ?? null;
  if (lastIntakeId.current !== currentIntakeId) {
    lastIntakeId.current = currentIntakeId;
    setDraft(baseline);
  }

  useEffect(() => {
    if (!armed) return;
    timerRef.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [armed]);

  if (!isClient) return null;

  const dirty = !statesEqual(draft, baseline);
  const canSave = dirty && isIntakeValid(draft, false) && !recordMutation.isPending;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    try {
      await recordMutation.mutateAsync(intakeToInput(draft));
      // Saving is the end of the task — go back to the profile the client
      // pushed from instead of leaving them on a form with nothing left to
      // do. On failure we stay put, so the error sits next to the fields.
      router.back();
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

  const showRevoke = !!intake && !withdrawMutation.isPending;

  return (
    <ScreenContainerRaw
      title={t("profile.healthSection")}
      headerVariant="detail"
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        // mode="layout" appends a real spacer below the content so the LAST
        // field (additionalNotes) can always be lifted above the keyboard —
        // insets mode relies on iOS contentInset, which is flaky when the
        // content is only ~as tall as the viewport (our case).
        mode="layout"
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 24,
          paddingTop: 24,
          // Static: reserve the sticky-footer space unconditionally. Changing
          // content height mid-focus doesn't re-trigger the library's scroll
          // (it only re-syncs on bottomOffset), so we keep this constant.
          paddingBottom: Math.max(96, bottomPad),
        }}
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!intake ? (
          <Text className="text-[13px] text-muted leading-5">
            {t("profile.healthEmpty")}
          </Text>
        ) : null}

        <HealthIntakeForm
          state={draft}
          onChange={setDraft}
          showConsentCheckbox={false}
        />

        {error ? (
          <Text className="text-[12px] text-danger">{error}</Text>
        ) : null}

        {showRevoke ? (
          <View style={{ alignItems: "center" }}>
            <Pressable
              testID="profile-health-withdraw"
              onPress={handleWithdraw}
              hitSlop={12}
              style={{ paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Text
                className={`text-[13px] text-danger ${armed ? "font-body-medium" : ""}`}
                style={{ textDecorationLine: "underline" }}
              >
                {armed
                  ? t("profile.healthWithdrawConfirm")
                  : t("profile.healthWithdraw")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {dirty ? (
        <View
          className="absolute left-0 right-0 bottom-0 bg-background border-t border-glass-border"
          style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 }}
        >
          <Button
            testID="profile-health-save"
            onPress={handleSave}
            disabled={!canSave}
          >
            {recordMutation.isPending
              ? t("profile.healthSaving")
              : t("profile.healthSaveChanges")}
          </Button>
        </View>
      ) : null}
    </ScreenContainerRaw>
  );
}
