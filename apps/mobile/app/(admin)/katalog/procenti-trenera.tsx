/**
 * Katalog → Procenti trenera.
 *
 * Each trainer's commission percentage, and the history behind it. Rates are
 * append-only: setting a new one records it from a date rather than editing the
 * old value, so a raise in March cannot silently rewrite what February already
 * paid. The list shows the rate in force today; the sheet shows the trail.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import {
  createTrainerRateMutationOptions,
  payrollQueries,
} from "@/lib/queries/payroll-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import { formatMutationError } from "@/lib/admin/format-mutation-error";
import {
  currentTrainerRate,
  trainerRateHistory,
} from "@/lib/trainer-rate-selection";
import { now } from "@/lib/now";

export default function ProcentiTrenera() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding(24);

  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [percent, setPercent] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(() => now());
  const [note, setNote] = useState("");

  const trainersQuery = useQuery(usersQueries.trainers());
  const ratesQuery = useQuery(payrollQueries.rates());
  const createRate = useMutation(createTrainerRateMutationOptions(queryClient));

  // The trainers endpoint also returns admins (it feeds session assignment);
  // a rate only means something for an actual TRAINER, and the API rejects
  // anyone else.
  const trainers = (trainersQuery.data?.users ?? []).filter(
    (u) => u.role === "TRAINER",
  );
  const rates = ratesQuery.data?.rates ?? [];

  const currentRate = (trainerUserId: string) =>
    currentTrainerRate(rates, trainerUserId);
  const historyFor = (trainerUserId: string) =>
    trainerRateHistory(rates, trainerUserId);

  function openEditor(trainer: { id: string; fullName: string }) {
    setEditing({ id: trainer.id, name: trainer.fullName });
    setPercent(String(currentRate(trainer.id)?.percent ?? ""));
    setEffectiveFrom(now());
    setNote("");
    createRate.reset();
  }

  const parsedPercent = Number(percent);
  const percentValid =
    percent.trim() !== "" &&
    Number.isInteger(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 100;

  return (
    <ScreenContainerRaw>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
      >
        <View className="mb-4 flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.a11yGoBack")}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl"
            testID="procenti-back"
          >
            <Icon name="chevron-left" size={22} color={tokens.foreground} />
          </Pressable>
          <View className="flex-1">
            <Text
              className="text-2xl font-semibold"
              style={{ color: tokens.foreground }}
            >
              {t("payroll.ratesTitle")}
            </Text>
            <Text className="text-sm" style={{ color: tokens.muted }}>
              {t("payroll.ratesSubtitle")}
            </Text>
          </View>
        </View>

        {trainersQuery.isError || ratesQuery.isError ? (
          <ErrorState
            message={
              (trainersQuery.error ?? ratesQuery.error)?.message ?? ""
            }
            testID="procenti-error"
          />
        ) : trainersQuery.isLoading || ratesQuery.isLoading ? (
          <SkeletonList count={3} />
        ) : trainers.length === 0 ? (
          <EmptyState title={t("payroll.noTrainers")} />
        ) : (
          <View className="gap-3">
            {trainers.map((trainer) => {
              const rate = currentRate(trainer.id);
              return (
                <Pressable
                  key={trainer.id}
                  accessibilityRole="button"
                  testID={`procenti-trainer-${trainer.id}`}
                  onPress={() => openEditor(trainer)}
                >
                  <GlassCard className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text
                          className="text-base font-semibold"
                          style={{ color: tokens.foreground }}
                        >
                          {trainer.fullName}
                        </Text>
                        <Text className="mt-0.5 text-xs" style={{ color: tokens.muted }}>
                          {rate
                            ? `${t("payroll.effectiveFrom")} ${new Date(
                                rate.effectiveFrom,
                              ).toLocaleDateString(i18n.language)}`
                            : t("payroll.noRateHint")}
                        </Text>
                      </View>
                      <Text
                        className="text-xl font-semibold"
                        style={{
                          color: rate ? tokens.foreground : tokens.warning,
                        }}
                        testID={`procenti-value-${trainer.id}`}
                      >
                        {rate ? `${rate.percent}%` : "—"}
                      </Text>
                      <Icon
                        name="chevron-right"
                        size={16}
                        color={tokens.faint}
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  </GlassCard>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <AppSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <View className="gap-4 px-1 pb-2">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {editing?.name ?? ""}
          </Text>
          <View>
            <CapsLabel>{t("payroll.percent")}</CapsLabel>
            <Input
              value={percent}
              onChangeText={setPercent}
              keyboardType="number-pad"
              placeholder="40"
              testID="procenti-percent-input"
            />
          </View>

          <View>
            <CapsLabel>{t("payroll.effectiveFrom")}</CapsLabel>
            <DateTimePicker
              mode="date"
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              testID="procenti-effective-from"
            />
            <Text className="mt-1 text-xs" style={{ color: tokens.muted }}>
              {t("payroll.effectiveFromHint")}
            </Text>
          </View>

          <View>
            <CapsLabel>{t("payroll.rateNote")}</CapsLabel>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("payroll.rateNotePlaceholder")}
              testID="procenti-note-input"
            />
          </View>

          {editing && historyFor(editing.id).length > 0 && (
            <View>
              <CapsLabel>{t("payroll.rateHistory")}</CapsLabel>
              <View className="mt-1 gap-1">
                {historyFor(editing.id).map((rate) => (
                  <View
                    key={rate.id}
                    className="flex-row items-center justify-between"
                  >
                    <Text className="text-sm" style={{ color: tokens.muted }}>
                      {new Date(rate.effectiveFrom).toLocaleDateString(
                        i18n.language,
                      )}
                      {rate.note ? ` · ${rate.note}` : ""}
                    </Text>
                    <Text
                      className="text-sm font-medium"
                      style={{ color: tokens.foreground }}
                    >
                      {rate.percent}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {createRate.error && (
            <Text className="text-sm" style={{ color: tokens.danger }}>
              {formatMutationError(
                createRate.error,
                t,
                i18n.language === "en" ? "en" : "sr",
                t("payroll.saveRate"),
              )}
            </Text>
          )}

          <Button
            disabled={!percentValid || createRate.isPending}
            testID="procenti-save"
            onPress={async () => {
              if (!editing || !percentValid) return;
              await createRate.mutateAsync({
                trainerUserId: editing.id,
                percent: parsedPercent,
                // Date-only: the server normalizes to the studio day boundary.
                effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
                note: note.trim() || undefined,
              });
              setEditing(null);
            }}
          >
            {t("payroll.saveRate")}
          </Button>
        </View>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
