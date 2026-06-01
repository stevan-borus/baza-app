import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import type {
  ActivityLevelCode,
  DiscomfortMovementCode,
  ExerciseFrequencyCode,
  HealthConditionCode,
  HealthGoalCode,
  HealthIntakeInput,
  PilatesExperienceCode,
} from "@baza/types";
import { Input } from "@/components/ui/input";
import { useThemeTokens } from "@/components/ui/tokens";
import { Body, CapsLabel } from "@/components/ui/studio";

export type HealthIntakeState = {
  conditions: HealthConditionCode[];
  conditionsOther: string;
  underMedicalTreatment: boolean | null;
  medicalTreatmentDetails: string;
  pilatesExperience: PilatesExperienceCode[];
  pilatesExperienceDuration: string;
  activityLevel: ActivityLevelCode | null;
  exerciseFrequency: ExerciseFrequencyCode | null;
  goals: HealthGoalCode[];
  goalsOther: string;
  discomfortDuring: DiscomfortMovementCode[];
  additionalNotes: string;
  consented: boolean;
};

export const EMPTY_INTAKE: HealthIntakeState = {
  conditions: [],
  conditionsOther: "",
  underMedicalTreatment: null,
  medicalTreatmentDetails: "",
  pilatesExperience: [],
  pilatesExperienceDuration: "",
  activityLevel: null,
  exerciseFrequency: null,
  goals: [],
  goalsOther: "",
  discomfortDuring: [],
  additionalNotes: "",
  consented: false,
};

const CONDITION_CODES: HealthConditionCode[] = [
  "neck_pain",
  "back_pain",
  "disc_herniation",
  "scoliosis",
  "joint_pain_injuries",
  "osteoporosis",
  "high_blood_pressure",
  "dizziness_balance",
  "recent_surgery",
  "pregnancy_postpartum",
];

const PILATES_EXPERIENCE_CODES: PilatesExperienceCode[] = [
  "none",
  "mat",
  "reformer",
  "clinical",
];

const ACTIVITY_LEVEL_CODES: ActivityLevelCode[] = [
  "sedentary",
  "moderate",
  "high",
];

const EXERCISE_FREQUENCY_CODES: ExerciseFrequencyCode[] = ["0-1", "2-3", "4+"];

const GOAL_CODES: HealthGoalCode[] = [
  "improve_posture",
  "reduce_pain",
  "increase_flexibility",
  "core_strength",
  "rehabilitation",
  "stress_reduction",
  "movement_quality",
];

const DISCOMFORT_CODES: DiscomfortMovementCode[] = [
  "sitting",
  "standing",
  "walking",
  "bending",
  "rotation",
  "balance",
];

export function isIntakeValid(
  state: HealthIntakeState,
  requireConsent = true,
): boolean {
  if (requireConsent && !state.consented) return false;
  if (state.underMedicalTreatment === null) return false;
  if (
    state.underMedicalTreatment &&
    state.medicalTreatmentDetails.trim().length === 0
  )
    return false;
  if (state.pilatesExperience.length === 0) return false;
  if (state.activityLevel === null) return false;
  if (state.exerciseFrequency === null) return false;
  return true;
}

export function intakeToInput(state: HealthIntakeState): HealthIntakeInput {
  // The form gates Save behind isIntakeValid(), which guarantees these
  // single-select fields are non-null. The non-null assertions encode that
  // invariant for the type system.
  return {
    conditions: state.conditions,
    conditionsOther:
      state.conditionsOther.trim().length > 0
        ? state.conditionsOther.trim()
        : undefined,
    underMedicalTreatment: state.underMedicalTreatment ?? false,
    medicalTreatmentDetails: state.underMedicalTreatment
      ? state.medicalTreatmentDetails.trim()
      : undefined,
    pilatesExperience: state.pilatesExperience,
    pilatesExperienceDuration:
      state.pilatesExperienceDuration.trim().length > 0
        ? state.pilatesExperienceDuration.trim()
        : undefined,
    activityLevel: state.activityLevel!,
    exerciseFrequency: state.exerciseFrequency!,
    goals: state.goals,
    goalsOther:
      state.goalsOther.trim().length > 0 ? state.goalsOther.trim() : undefined,
    discomfortDuring: state.discomfortDuring,
    additionalNotes:
      state.additionalNotes.trim().length > 0
        ? state.additionalNotes.trim()
        : undefined,
  };
}

type Props = {
  state: HealthIntakeState;
  onChange: (next: HealthIntakeState) => void;
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

  function toggle<T extends string>(arr: T[], code: T): T[] {
    return arr.includes(code) ? arr.filter((c) => c !== code) : [...arr, code];
  }

  return (
    <View testID="health-intake-form" className="gap-7">
      {/* ─── Health History ───────────────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionHealthHistory")} />

        <Question label={t("intake.q.conditions")}>
          <View>
            {CONDITION_CODES.map((code, idx) => (
              <ChipRow
                key={code}
                isFirst={idx === 0}
                testID={`condition-${code}`}
                label={t(`intake.conditions.${code}`)}
                selected={state.conditions.includes(code)}
                onPress={() =>
                  patch({ conditions: toggle(state.conditions, code) })
                }
              />
            ))}
          </View>
          <View className="mt-3">
            <Input
              testID="conditionsOther"
              placeholder={t("intake.otherPlaceholder")}
              value={state.conditionsOther}
              onChangeText={(v) => patch({ conditionsOther: v })}
            />
          </View>
        </Question>

        <Question label={t("intake.q.underMedicalTreatment")}>
          <YesNoToggle
            testID="underMedicalTreatment"
            value={state.underMedicalTreatment}
            onChange={(v) => patch({ underMedicalTreatment: v })}
          />
          {state.underMedicalTreatment ? (
            <View className="mt-2">
              <Body size={13} className="text-muted mb-1.5">
                {t("intake.q.underMedicalTreatmentDetails")}
              </Body>
              <Input
                testID="medicalTreatmentDetails"
                placeholder={t("intake.freeTextPlaceholder")}
                value={state.medicalTreatmentDetails}
                onChangeText={(v) => patch({ medicalTreatmentDetails: v })}
                multiline
              />
            </View>
          ) : null}
        </Question>
      </View>

      {/* ─── Pilates Experience ───────────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionPilatesExperience")} />
        <Question label={t("intake.q.pilatesExperience")}>
          <View>
            {PILATES_EXPERIENCE_CODES.map((code, idx) => (
              <ChipRow
                key={code}
                isFirst={idx === 0}
                testID={`pilatesExperience-${code}`}
                label={t(`intake.pilatesExperience.${code}`)}
                selected={state.pilatesExperience.includes(code)}
                onPress={() =>
                  patch({
                    pilatesExperience: toggle(state.pilatesExperience, code),
                  })
                }
              />
            ))}
          </View>
          {state.pilatesExperience.some((c) => c !== "none") ? (
            <View className="mt-3">
              <Body size={13} className="text-muted mb-1.5">
                {t("intake.q.pilatesExperienceDuration")}
              </Body>
              <Input
                testID="pilatesExperienceDuration"
                placeholder={t("intake.freeTextPlaceholder")}
                value={state.pilatesExperienceDuration}
                onChangeText={(v) => patch({ pilatesExperienceDuration: v })}
              />
            </View>
          ) : null}
        </Question>
      </View>

      {/* ─── Lifestyle & Activity ─────────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionLifestyle")} />
        <Question label={t("intake.q.activityLevel")}>
          <View>
            {ACTIVITY_LEVEL_CODES.map((code, idx) => (
              <ChipRow
                key={code}
                isFirst={idx === 0}
                testID={`activityLevel-${code}`}
                label={t(`intake.activityLevel.${code}`)}
                selected={state.activityLevel === code}
                onPress={() => patch({ activityLevel: code })}
              />
            ))}
          </View>
        </Question>

        <Question label={t("intake.q.exerciseFrequency")}>
          <View className="flex-row gap-2">
            {EXERCISE_FREQUENCY_CODES.map((code) => {
              const selected = state.exerciseFrequency === code;
              return (
                <Pressable
                  key={code}
                  testID={`exerciseFrequency-${code}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ exerciseFrequency: code })}
                  className={`flex-1 h-11 rounded-xl items-center justify-center ${
                    selected
                      ? "bg-accent"
                      : "bg-glass border border-glass-border"
                  }`}
                >
                  <Body
                    size={14}
                    className={selected ? "text-white" : "text-foreground"}
                  >
                    {t(`intake.exerciseFrequency.${code}`)}
                  </Body>
                </Pressable>
              );
            })}
          </View>
        </Question>
      </View>

      {/* ─── Goals ────────────────────────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionGoals")} />
        <Question label={t("intake.q.goals")}>
          <View>
            {GOAL_CODES.map((code, idx) => (
              <ChipRow
                key={code}
                isFirst={idx === 0}
                testID={`goal-${code}`}
                label={t(`intake.goals.${code}`)}
                selected={state.goals.includes(code)}
                onPress={() => patch({ goals: toggle(state.goals, code) })}
              />
            ))}
          </View>
          <View className="mt-3">
            <Input
              testID="goalsOther"
              placeholder={t("intake.otherPlaceholder")}
              value={state.goalsOther}
              onChangeText={(v) => patch({ goalsOther: v })}
            />
          </View>
        </Question>
      </View>

      {/* ─── Body Awareness ───────────────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionBodyAwareness")} />
        <Question label={t("intake.q.discomfortDuring")}>
          <View>
            {DISCOMFORT_CODES.map((code, idx) => (
              <ChipRow
                key={code}
                isFirst={idx === 0}
                testID={`discomfort-${code}`}
                label={t(`intake.discomfortDuring.${code}`)}
                selected={state.discomfortDuring.includes(code)}
                onPress={() =>
                  patch({
                    discomfortDuring: toggle(state.discomfortDuring, code),
                  })
                }
              />
            ))}
          </View>
        </Question>
      </View>

      {/* ─── Additional Information ───────────────────────────────── */}
      <View className="gap-3">
        <SectionHeader title={t("intake.sectionAdditional")} />
        <Question label={t("intake.q.additionalNotes")}>
          <Input
            testID="additionalNotes"
            placeholder={t("intake.freeTextPlaceholder")}
            value={state.additionalNotes}
            onChangeText={(v) => patch({ additionalNotes: v })}
            multiline
          />
        </Question>
      </View>

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
              <Icon name="check" size={14} color={tokens.background} />
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

function SectionHeader({ title }: { title: string }) {
  return (
    <CapsLabel size={11} tracking={2}>
      {title}
    </CapsLabel>
  );
}

function Question({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Body size={14} className="text-foreground font-body-medium">
        {label}
      </Body>
      {children}
    </View>
  );
}

function ChipRow({
  label,
  selected,
  onPress,
  testID,
  isFirst,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  isFirst?: boolean;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`flex-row items-center gap-3 h-11 active:opacity-60 ${
        isFirst ? "" : "border-t border-glass-border"
      }`}
    >
      <View
        className={`h-[18px] w-[18px] rounded items-center justify-center ${
          selected ? "bg-accent" : "border border-glass-border bg-transparent"
        }`}
      >
        {selected ? (
          <Icon name="check" size={12} color={tokens.background} />
        ) : null}
      </View>
      <Body size={14} className="flex-1 text-foreground">
        {label}
      </Body>
    </Pressable>
  );
}

function YesNoToggle({
  value,
  onChange,
  testID,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
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
            className={`flex-1 h-11 rounded-xl items-center justify-center ${
              selected ? "bg-accent" : "bg-glass border border-glass-border"
            }`}
          >
            <Body
              size={14}
              className={selected ? "text-white" : "text-foreground"}
            >
              {t(v ? "intake.yes" : "intake.no")}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}
