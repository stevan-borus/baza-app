/**
 * Katalog → Procenti trenera.
 *
 * Each trainer's commission percentage, and the history behind it. Rates are
 * append-only: setting a new one records it from a date rather than editing the
 * old value, so a raise in March cannot silently rewrite what February already
 * paid. The list shows the rate in force today; the sheet shows the trail.
 */
import { useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { SectionLabel } from "@/components/ui/typography";
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
    <ScreenContainerRaw
      title={t("payroll.ratesTitle")}
      headerVariant="detail"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 350 }}
        >
          <View className="mb-1 flex-row items-center justify-between">
            <SectionLabel>
              {t("payroll.ratesTitle")} · {trainers.length}
            </SectionLabel>
          </View>
        </MotiView>

        {trainersQuery.isError || ratesQuery.isError ? (
          <ErrorState
            message={
              (trainersQuery.error ?? ratesQuery.error)?.message ?? ""
            }
            testID="procenti-error"
          />
        ) : trainersQuery.isLoading || ratesQuery.isLoading ? (
          <View style={{ gap: 8 }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : trainers.length === 0 ? (
          <EmptyState title={t("payroll.noTrainers")} />
        ) : (
          trainers.map((trainer, idx) => {
            const rate = currentRate(trainer.id);
            return (
              <MotiView
                key={trainer.id}
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 380, delay: idx * 60 }}
              >
                <Pressable
                  accessibilityRole="button"
                  testID={`procenti-trainer-${trainer.id}`}
                  onPress={() => openEditor(trainer)}
                  android_ripple={null}
                  className="active:opacity-70"
                >
                  <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
                    <View className="flex-row items-center gap-3.5 px-4 py-3.5">
                      <View className="flex-1">
                        <Text
                          className="text-foreground font-body-medium"
                          style={{ fontSize: 16 }}
                          numberOfLines={1}
                        >
                          {trainer.fullName}
                        </Text>
                        {/* Only say something when there IS something to say:
                            an unset rate is the exception worth calling out. */}
                        {rate ? (
                          <Text className="text-muted mt-0.5" style={{ fontSize: 13 }}>
                            {`${t("payroll.effectiveFrom")} ${new Date(
                              rate.effectiveFrom,
                            ).toLocaleDateString(i18n.language)}`}
                          </Text>
                        ) : (
                          <Text className="mt-0.5" style={{ fontSize: 13, color: tokens.warning }}>
                            {t("payroll.noRateHint")}
                          </Text>
                        )}
                      </View>

                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className="font-body-medium"
                          style={{
                            fontSize: 15,
                            color: rate ? tokens.foreground : tokens.warning,
                          }}
                          testID={`procenti-value-${trainer.id}`}
                        >
                          {rate ? `${rate.percent}%` : "—"}
                        </Text>
                        <Icon name="chevron-right" size={11} color="#52525b" />
                      </View>
                    </View>
                  </GlassCard>
                </Pressable>
              </MotiView>
            );
          })
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
            <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">{t("payroll.percent")}</CapsLabel>
            <Input
              value={percent}
              onChangeText={setPercent}
              keyboardType="number-pad"
              placeholder="40"
              testID="procenti-percent-input"
            />
          </View>

          <View>
            <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">{t("payroll.effectiveFrom")}</CapsLabel>
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
            <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">{t("payroll.rateNote")}</CapsLabel>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("payroll.rateNotePlaceholder")}
              testID="procenti-note-input"
            />
          </View>

          {editing && historyFor(editing.id).length > 0 && (
            <View>
              <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">{t("payroll.rateHistory")}</CapsLabel>
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
                // The CALENDAR date the admin picked, formatted locally — not
                // via toISOString(), which converts to UTC first and would send
                // the previous day for anything picked before 02:00 in
                // Belgrade, starting the rate in the wrong month. The server
                // re-stamps it at the studio day boundary.
                effectiveFrom: dayjs(effectiveFrom).format("YYYY-MM-DD"),
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
