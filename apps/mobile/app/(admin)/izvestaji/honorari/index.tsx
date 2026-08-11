/**
 * Izveštaji → Honorari (trainer payouts) — month overview.
 *
 * One row per trainer for the selected calendar month: sessions held,
 * attendees, what those sessions were worth, and the trainer's cut. Tapping a
 * row opens the full per-session breakdown.
 *
 * The month defaults to the PREVIOUS one — payroll is settled after a month
 * ends, so that is the month the owner is about to pay.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { MonthStepper } from "@/components/payroll/month-stepper";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { defaultPayrollMonth, type PayrollMonthCursor } from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";

export default function IzvestajiHonorari() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [cursor, setCursor] = useState<PayrollMonthCursor>(defaultPayrollMonth);
  const [refreshing, setRefreshing] = useState(false);

  const summaryQuery = useQuery(payrollQueries.summary(cursor));

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: payrollQueries.all });
    setRefreshing(false);
  }

  const trainers = summaryQuery.data?.trainers ?? [];

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={t("payroll.title")}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="mb-4">
          <MonthStepper cursor={cursor} onChange={setCursor} />
        </View>

        {summaryQuery.isError ? (
          <ErrorState message={summaryQuery.error.message} testID="honorari-error" />
        ) : summaryQuery.isLoading ? (
          <SkeletonList count={4} />
        ) : trainers.length === 0 ? (
          <EmptyState title={t("payroll.noTrainers")} />
        ) : (
          <>
            <GlassCard className="mb-4 p-4">
              <CapsLabel>{t("payroll.totalPayout")}</CapsLabel>
              <Text
                className="mt-1 text-3xl font-semibold"
                style={{ color: tokens.foreground }}
                testID="honorari-total"
              >
                {formatRsd(summaryQuery.data?.totalPayout ?? 0)}
              </Text>
            </GlassCard>

            <View className="gap-3">
              {trainers.map((trainer) => (
                <Pressable
                  key={trainer.trainerUserId}
                  accessibilityRole="button"
                  testID={`honorari-trainer-${trainer.trainerUserId}`}
                  onPress={() =>
                    router.push({
                      pathname: "/(admin)/izvestaji/honorari/[trainerId]",
                      params: {
                        trainerId: trainer.trainerUserId,
                        year: String(cursor.year),
                        month: String(cursor.month),
                      },
                    })
                  }
                >
                  <GlassCard className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text
                          className="text-base font-semibold"
                          style={{ color: tokens.foreground }}
                        >
                          {trainer.trainerName}
                        </Text>
                        <Text className="mt-0.5 text-sm" style={{ color: tokens.muted }}>
                          {t("payroll.sessionsHeldShort", {
                            count: trainer.sessionCount,
                          })}{" "}
                          ·{" "}
                          {t("payroll.attendeesShort", {
                            count: trainer.attendeeCount,
                          })}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text
                          className="text-lg font-semibold"
                          style={{ color: tokens.foreground }}
                        >
                          {formatRsd(trainer.netPayout)}
                        </Text>
                        <Text className="text-xs" style={{ color: tokens.muted }}>
                          {trainer.percent === null
                            ? t("payroll.noRate")
                            : `${trainer.percent}% · ${formatRsd(trainer.gross)}`}
                        </Text>
                      </View>
                    </View>

                    {(trainer.unpricedCount > 0 || trainer.giftCount > 0) && (
                      <View className="mt-3 flex-row flex-wrap gap-2">
                        {trainer.giftCount > 0 && (
                          <Chip
                            label={`${t("payroll.gift")} · ${trainer.giftCount}`}
                            color={tokens.accent}
                            background={tokens.accentSoft}
                          />
                        )}
                        {trainer.unpricedCount > 0 && (
                          <Chip
                            label={t("payroll.unpricedWarning", {
                              count: trainer.unpricedCount,
                            })}
                            color={tokens.warning}
                            background={tokens.warningSoft}
                          />
                        )}
                      </View>
                    )}
                  </GlassCard>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}

function Chip({
  label,
  color,
  background,
}: {
  label: string;
  color: string;
  background: string;
}) {
  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{ backgroundColor: background }}
    >
      <Text className="text-xs font-medium" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
