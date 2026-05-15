import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import type { HealthIntakeInput } from "@baza/types";
import { GlassCard } from "@/components/ui/glass-card";
import { useThemeTokens } from "@/components/ui/tokens";

type Submit =
  | { kind: "save"; input: HealthIntakeInput }
  | { kind: "skip" };

type Props = {
  onSubmit: (s: Submit) => void;
  isSubmitting?: boolean;
  /**
   * Banner rendered above the form. The screen passes "saved" after a
   * successful save, "skipped" after the user taps Skip, and null when
   * neither has happened yet.
   */
  bannerKind: "saved" | "skipped" | null;
};

export function HealthIntakeForm({ onSubmit, isSubmitting, bannerKind }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState({
    isPhysicallyActive: false,
    isFirstPilates: false,
    hasComplaints: false,
    complaintsDetails: "",
    hasInjuries: false,
    injuriesDetails: "",
    isPregnant: false,
    isPostpartum: false,
    consented: false,
  });

  const detailsMissing =
    (state.hasComplaints && state.complaintsDetails.trim().length === 0) ||
    (state.hasInjuries && state.injuriesDetails.trim().length === 0);
  const canSave = state.consented && !detailsMissing && !isSubmitting;

  function handleSave() {
    if (!canSave) return;
    onSubmit({
      kind: "save",
      input: {
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
      },
    });
  }

  return (
    <View testID="health-intake-form" className="px-6">
      <GlassCard size="md">
        <Text className="text-[18px] text-foreground font-body-bold">
          {t("intake.title")}
        </Text>
        <Text className="mt-2 text-[13px] text-muted leading-5">
          {t("intake.notice")}
        </Text>

        {bannerKind === "saved" ? (
          <View className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3">
            <Text className="text-[13px] text-success">
              {t("intake.savedBanner")}
            </Text>
          </View>
        ) : null}
        {bannerKind === "skipped" ? (
          <View className="mt-3 rounded-xl border border-foreground/15 bg-foreground/5 p-3">
            <Text className="text-[13px] text-muted">
              {t("intake.skippedBanner")}
            </Text>
          </View>
        ) : null}

        {bannerKind === null ? (
          <View className="mt-4 gap-3">
            <YesNoRow
              testID="q-physicallyActive"
              label={t("intake.q.physicallyActive")}
              value={state.isPhysicallyActive}
              onChange={(v) =>
                setState((s) => ({ ...s, isPhysicallyActive: v }))
              }
            />
            <YesNoRow
              testID="q-firstPilates"
              label={t("intake.q.firstPilates")}
              value={state.isFirstPilates}
              onChange={(v) => setState((s) => ({ ...s, isFirstPilates: v }))}
            />
            <YesNoRow
              testID="q-complaints"
              label={t("intake.q.complaints")}
              value={state.hasComplaints}
              onChange={(v) => setState((s) => ({ ...s, hasComplaints: v }))}
            />
            {state.hasComplaints ? (
              <FreeText
                testID="complaintsDetails"
                label={t("intake.q.complaintsDetailsLabel")}
                placeholder={t("intake.q.complaintsDetailsPlaceholder")}
                value={state.complaintsDetails}
                onChangeText={(v) =>
                  setState((s) => ({ ...s, complaintsDetails: v }))
                }
              />
            ) : null}
            <YesNoRow
              testID="q-injuries"
              label={t("intake.q.injuries")}
              value={state.hasInjuries}
              onChange={(v) => setState((s) => ({ ...s, hasInjuries: v }))}
            />
            {state.hasInjuries ? (
              <FreeText
                testID="injuriesDetails"
                label={t("intake.q.injuriesDetailsLabel")}
                placeholder={t("intake.q.injuriesDetailsPlaceholder")}
                value={state.injuriesDetails}
                onChangeText={(v) =>
                  setState((s) => ({ ...s, injuriesDetails: v }))
                }
              />
            ) : null}
            <YesNoRow
              testID="q-pregnant"
              label={t("intake.q.pregnant")}
              value={state.isPregnant}
              onChange={(v) => setState((s) => ({ ...s, isPregnant: v }))}
            />
            <YesNoRow
              testID="q-postpartum"
              label={t("intake.q.postpartum")}
              value={state.isPostpartum}
              onChange={(v) => setState((s) => ({ ...s, isPostpartum: v }))}
            />

            <Pressable
              testID="intake-consent"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: state.consented }}
              onPress={() =>
                setState((s) => ({ ...s, consented: !s.consented }))
              }
              className="mt-2 flex-row items-start gap-3 rounded-xl border border-foreground/15 bg-foreground/5 p-3"
            >
              <View
                className={`mt-[2px] h-5 w-5 rounded border ${
                  state.consented
                    ? "border-foreground bg-foreground"
                    : "border-foreground/40 bg-transparent"
                }`}
              />
              <Text className="flex-1 text-[13px] text-foreground leading-5">
                {t("intake.consentCheckbox")}
              </Text>
            </Pressable>

            <View className="mt-3 gap-2">
              <Pressable
                testID="intake-save"
                disabled={!canSave}
                onPress={handleSave}
                className={`items-center rounded-2xl py-3 ${
                  canSave ? "bg-foreground" : "bg-foreground/20"
                }`}
              >
                <Text
                  className={`text-[15px] font-body-semibold ${
                    canSave ? "text-background" : "text-foreground/40"
                  }`}
                >
                  {t("intake.save")}
                </Text>
              </Pressable>
              <Pressable
                testID="intake-skip"
                onPress={() => onSubmit({ kind: "skip" })}
                className="items-center py-3"
              >
                <Text className="text-[13px] text-muted underline">
                  {t("intake.skip")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </GlassCard>
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
      <Text className="flex-1 text-[14px] text-foreground">{label}</Text>
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
              className={`min-w-[56px] items-center rounded-lg border px-3 py-2 ${
                selected
                  ? "border-foreground/40 bg-foreground/10"
                  : "border-foreground/15 bg-transparent"
              }`}
            >
              <Text className="text-[14px] text-foreground">
                {t(v ? "intake.yes" : "intake.no")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FreeText({
  label,
  placeholder,
  value,
  onChangeText,
  testID,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  testID: string;
}) {
  const tokens = useThemeTokens();
  return (
    <View>
      <Text className="mb-1 text-[12px] text-muted">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.faint}
        multiline
        className="min-h-[72px] rounded-xl border border-foreground/15 bg-foreground/5 p-3 text-[14px] text-foreground"
      />
    </View>
  );
}
