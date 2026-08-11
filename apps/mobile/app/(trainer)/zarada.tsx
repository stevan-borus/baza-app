/**
 * Trainer → Moja zarada.
 *
 * The trainer's own month: sessions held, who was there, and what they earned.
 * The server derives the trainer from the session — this screen never sends a
 * trainer id — so there is no path from here to another trainer's figures.
 *
 * The month in progress is labelled preliminary, since a session held tomorrow
 * still adds to it. Past months are settled: each line froze when its session
 * was consumed.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/i18n";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { TrainerScheduleLeftSlot } from "@/components/trainer/trainer-tab-left-slot";
import { MonthStepper } from "@/components/payroll/month-stepper";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { defaultPayrollMonth, type PayrollMonthCursor } from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";

export default function TrainerZarada() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [cursor, setCursor] = useState<PayrollMonthCursor>(defaultPayrollMonth);
  const [refreshing, setRefreshing] = useState(false);

  // No trainerUserId: "my own month" is the only form a trainer may request.
  const monthQuery = useQuery(payrollQueries.month(cursor));

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: payrollQueries.all });
    setRefreshing(false);
  }

  const month = monthQuery.data?.month;
  // A month still in progress can still move: a session held tomorrow adds to
  // it. Past months are settled, because each line freezes when it is consumed.
  const today = defaultPayrollMonth();
  const isCurrentMonth =
    cursor.year === today.year && cursor.month === today.month;

  return (
    <ScreenContainerRaw
      title={t("payroll.myEarnings")}
      leftSlot={<TrainerScheduleLeftSlot />}
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

        {monthQuery.isError ? (
          <ErrorState message={monthQuery.error.message} testID="zarada-error" />
        ) : monthQuery.isLoading || !month ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <GlassCard className="mb-4 p-4">
              <CapsLabel>{t("payroll.netPayout")}</CapsLabel>
              <Text
                className="mt-1 text-3xl font-semibold"
                style={{ color: tokens.foreground }}
                testID="zarada-payout"
              >
                {formatRsd(month.netPayout)}
              </Text>

              <View className="mt-3 flex-row gap-6">
                <View>
                  <Text className="text-xs" style={{ color: tokens.muted }}>
                    {t("payroll.sessionsHeld")}
                  </Text>
                  <Text
                    className="text-lg font-medium"
                    style={{ color: tokens.foreground }}
                  >
                    {month.sessionCount}
                  </Text>
                </View>
                <View>
                  <Text className="text-xs" style={{ color: tokens.muted }}>
                    {t("payroll.attendees")}
                  </Text>
                  <Text
                    className="text-lg font-medium"
                    style={{ color: tokens.foreground }}
                  >
                    {month.attendeeCount}
                  </Text>
                </View>
              </View>

              {isCurrentMonth && (
                <View
                  className="mt-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: tokens.surface2 }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: tokens.foreground }}
                    testID="zarada-preliminary"
                  >
                    {t("payroll.preliminary")}
                  </Text>
                  <Text className="mt-0.5 text-xs" style={{ color: tokens.muted }}>
                    {t("payroll.preliminaryHint")}
                  </Text>
                </View>
              )}

              {month.percent === null && (
                <Text
                  className="mt-3 text-sm"
                  style={{ color: tokens.warning }}
                  testID="zarada-no-rate"
                >
                  {t("payroll.noRate")}
                </Text>
              )}
            </GlassCard>

            <CapsLabel>{t("payroll.sessionsHeld")}</CapsLabel>
            {month.sessions.length === 0 ? (
              <EmptyState title={t("payroll.noSessions")} />
            ) : (
              <View className="mt-2 gap-3">
                {month.sessions.map((session) => (
                  <GlassCard key={session.sessionId} className="p-4">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-base font-semibold"
                        style={{ color: tokens.foreground }}
                      >
                        {session.classTypeName}
                      </Text>
                      <Text className="text-sm" style={{ color: tokens.muted }}>
                        {session.attendees.length} · {formatRsd(session.gross)}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-xs" style={{ color: tokens.muted }}>
                      {new Date(session.startsAt).toLocaleString(getDateLocale(), {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>

                    <View className="mt-3 gap-1.5">
                      {session.attendees.map((attendee) => (
                        <View
                          key={attendee.bookingId}
                          className="flex-row items-center justify-between"
                        >
                          <Text
                            className="flex-1 pr-2 text-sm"
                            style={{ color: tokens.foreground }}
                            numberOfLines={1}
                          >
                            {attendee.clientName}
                          </Text>
                          <Text className="text-xs" style={{ color: tokens.muted }}>
                            {attendee.packageName}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
