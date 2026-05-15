import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { HealthIntakeInput } from "@baza/types";
import { Input } from "@/components/ui/input";
import { useThemeTokens } from "@/components/ui/tokens";
import { Body } from "@/components/ui/studio";

export type HealthIntakeState = {
  isPhysicallyActive: boolean;
  isFirstPilates: boolean;
  hasComplaints: boolean;
  complaintsDetails: string;
  hasInjuries: boolean;
  injuriesDetails: string;
  isPregnant: boolean;
  isPostpartum: boolean;
  consented: boolean;
};

export const EMPTY_INTAKE: HealthIntakeState = {
  isPhysicallyActive: false,
  isFirstPilates: false,
  hasComplaints: false,
  complaintsDetails: "",
  hasInjuries: false,
  injuriesDetails: "",
  isPregnant: false,
  isPostpartum: false,
  consented: false,
};

/**
 * Returns true when the state is valid to save. When `requireConsent` is
 * true (the /consent first-time flow), the Art. 17 checkbox must be
 * ticked; in the profile-edit flow the Save tap is itself the affirmative
 * action and the checkbox is hidden, so consent is not required here.
 */
export function isIntakeValid(
  state: HealthIntakeState,
  requireConsent = true,
): boolean {
  if (requireConsent && !state.consented) return false;
  if (state.hasComplaints && state.complaintsDetails.trim().length === 0)
    return false;
  if (state.hasInjuries && state.injuriesDetails.trim().length === 0)
    return false;
  return true;
}

export function intakeToInput(state: HealthIntakeState): HealthIntakeInput {
  return {
    isPhysicallyActive: state.isPhysicallyActive,
    isFirstPilates: state.isFirstPilates,
    hasComplaints: state.hasComplaints,
    complaintsDetails: state.hasComplaints
      ? state.complaintsDetails.trim()
      : undefined,
    hasInjuries: state.hasInjuries,
    injuriesDetails: state.hasInjuries
      ? state.injuriesDetails.trim()
      : undefined,
    isPregnant: state.isPregnant,
    isPostpartum: state.isPostpartum,
  };
}

type Props = {
  state: HealthIntakeState;
  onChange: (next: HealthIntakeState) => void;
  /**
   * Whether to render the Art. 17 ZZPL consent checkbox. `true` on the
   * first-time /consent flow (we need an explicit tick to record legal
   * basis). `false` in the profile-edit flow, where the Save button is
   * itself the affirmative action and a redundant checkbox is noise.
   */
  showConsentCheckbox?: boolean;
};

export function HealthIntakeForm({
  state,
  onChange,
  showConsentCheckbox = true,
}: Props) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  function patch(p: Partial<HealthIntakeState>) {
    onChange({ ...state, ...p });
  }

  return (
    <View testID="health-intake-form" className="gap-3">
      <YesNoRow
        testID="q-physicallyActive"
        label={t("intake.q.physicallyActive")}
        value={state.isPhysicallyActive}
        onChange={(v) => patch({ isPhysicallyActive: v })}
      />
      <YesNoRow
        testID="q-firstPilates"
        label={t("intake.q.firstPilates")}
        value={state.isFirstPilates}
        onChange={(v) => patch({ isFirstPilates: v })}
      />
      <YesNoRow
        testID="q-complaints"
        label={t("intake.q.complaints")}
        value={state.hasComplaints}
        onChange={(v) => patch({ hasComplaints: v })}
      />
      {state.hasComplaints ? (
        <Input
          testID="complaintsDetails"
          placeholder={t("intake.q.complaintsDetailsPlaceholder")}
          value={state.complaintsDetails}
          onChangeText={(v) => patch({ complaintsDetails: v })}
          multiline
        />
      ) : null}
      <YesNoRow
        testID="q-injuries"
        label={t("intake.q.injuries")}
        value={state.hasInjuries}
        onChange={(v) => patch({ hasInjuries: v })}
      />
      {state.hasInjuries ? (
        <Input
          testID="injuriesDetails"
          placeholder={t("intake.q.injuriesDetailsPlaceholder")}
          value={state.injuriesDetails}
          onChangeText={(v) => patch({ injuriesDetails: v })}
          multiline
        />
      ) : null}
      <YesNoRow
        testID="q-pregnant"
        label={t("intake.q.pregnant")}
        value={state.isPregnant}
        onChange={(v) => patch({ isPregnant: v })}
      />
      <YesNoRow
        testID="q-postpartum"
        label={t("intake.q.postpartum")}
        value={state.isPostpartum}
        onChange={(v) => patch({ isPostpartum: v })}
      />

      {showConsentCheckbox ? (
        <Pressable
          testID="intake-consent"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state.consented }}
          onPress={() => patch({ consented: !state.consented })}
          className="mt-2 flex-row items-start gap-3"
        >
          <View
            className={`mt-[2px] h-5 w-5 rounded items-center justify-center ${
              state.consented
                ? "bg-accent"
                : "border border-glass-border bg-transparent"
            }`}
          >
            {state.consented ? (
              <Feather name="check" size={14} color={tokens.background} />
            ) : null}
          </View>
          <Body size={13} className="flex-1">
            {t("intake.consentCheckbox")}
          </Body>
        </Pressable>
      ) : null}
    </View>
  );
}

function YesNoRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      className="flex-row items-center justify-between gap-3"
    >
      <View className="flex-1">
        <Body size={14} className="text-foreground">
          {label}
        </Body>
      </View>
      <View className="flex-row gap-2">
        {([true, false] as const).map((v) => {
          const selected = value === v;
          return (
            <Pressable
              key={String(v)}
              testID={`${testID}-${v ? "yes" : "no"}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(v)}
              className={`min-w-[56px] h-9 rounded-xl items-center justify-center ${
                selected
                  ? "bg-accent"
                  : "bg-glass border border-glass-border"
              }`}
            >
              <Body
                size={13}
                className={
                  selected ? "text-white" : "text-foreground"
                }
              >
                {t(v ? "intake.yes" : "intake.no")}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
