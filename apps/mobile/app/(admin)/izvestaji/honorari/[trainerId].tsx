/**
 * Izveštaji → Honorari → one trainer's month.
 *
 * The auditable breakdown the owner pays from: every held session, what it was
 * worth, and the trainer's cut. Each session opens its own page for the
 * attendee-level detail — a row here is a summary, not a place to read names.
 *
 * There is no lock. A payout line is frozen when its session is consumed, so
 * the figures below cannot be rewritten by a later price edit or package
 * revoke, and nobody has to remember to press anything.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/ui/icon";
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
import { RateBreakdown } from "@/components/payroll/rate-breakdown";
import { SummaryRow } from "@/components/payroll/summary-row";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import {
  defaultPayrollMonth,
  type PayrollMonthCursor,
} from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";
import { getDateLocale } from "@/lib/i18n";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

export default function HonorariTrainerDetail() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const params = useLocalSearchParams<{
    trainerId: string;
    year?: string;
    month?: string;
  }>();

  // Params carry the month the list screen was showing; a direct deep link
  // without them falls back to the month payroll defaults to.
  const [cursor, setCursor] = useState<PayrollMonthCursor>(() => {
    const fallback = defaultPayrollMonth();
    return {
      year: Number(params.year) || fallback.year,
      month: Number(params.month) || fallback.month,
    };
  });
  const [refreshing, setRefreshing] = useState(false);

  const monthQuery = useQuery(
    payrollQueries.month({ ...cursor, trainerUserId: params.trainerId }),
  );

  const month = monthQuery.data?.month;
  const sessions = month?.sessions ?? [];
  const reveal = useRevealOnScroll(sessions.length);
  const visibleSessions = sessions.slice(0, reveal.visibleCount);

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: payrollQueries.all });
    setRefreshing(false);
  }

  function changeMonth(next: PayrollMonthCursor) {
    setCursor(next);
    // A new month is a new list; keeping the old offset would show a partial
    // slice of unrelated sessions.
    reveal.reset();
  }

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={month?.trainerName ?? t("payroll.trainer")}
    >
      <ScrollView
        testID="payroll-session-scroll"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        {...reveal.scrollProps}
      >
        <View className="mb-4">
          <MonthStepper cursor={cursor} onChange={changeMonth} />
        </View>

        {monthQuery.isError ? (
          <ErrorState message={monthQuery.error.message} testID="honorari-detail-error" />
        ) : monthQuery.isLoading || !month ? (
          <SkeletonList count={4} />
        ) : (
          <>
            <GlassCard className="mb-4 p-4">
              <CapsLabel>{t("payroll.netPayout")}</CapsLabel>
              <Text
                className="mt-1 text-3xl font-semibold"
                style={{ color: tokens.foreground }}
                testID="honorari-detail-payout"
              >
                {formatRsd(month.netPayout)}
              </Text>

              <View className="mt-3 gap-1">
                <SummaryRow
                  label={t("payroll.gross")}
                  value={formatRsd(month.gross)}
                />
                <SummaryRow
                  label={t("payroll.sessionsHeld")}
                  value={String(month.sessionCount)}
                />
                <SummaryRow
                  label={t("payroll.attendees")}
                  value={String(month.attendeeCount)}
                />
                {month.adjustmentTotal !== 0 && (
                  <SummaryRow
                    label={t("payroll.adjustments")}
                    value={formatRsd(month.adjustmentTotal)}
                  />
                )}
              </View>

              {month.buckets.some((bucket) => bucket.percent === null) && (
                <Text
                  className="mt-3 text-sm"
                  style={{ color: tokens.warning }}
                  testID="honorari-no-rate"
                >
                  {t("payroll.noRateHint")}
                </Text>
              )}
              {month.unpricedCount > 0 && (
                <Text
                  className="mt-2 text-sm"
                  style={{ color: tokens.warning }}
                  testID="honorari-unpriced"
                >
                  {t("payroll.unpricedWarning", { count: month.unpricedCount })}
                </Text>
              )}
              {month.giftCount > 0 && (
                <Text className="mt-2 text-sm" style={{ color: tokens.muted }}>
                  {t("payroll.giftHint")}
                </Text>
              )}
            </GlassCard>

            {month.buckets.length > 0 && (
              <GlassCard className="mb-4 p-4">
                <RateBreakdown buckets={month.buckets} testIDPrefix="honorari" />
              </GlassCard>
            )}

            <CapsLabel>{t("payroll.sessionsHeld")}</CapsLabel>
            {sessions.length === 0 ? (
              <EmptyState title={t("payroll.noSessions")} />
            ) : (
              <View className="mt-2 gap-3">
                {visibleSessions.map((session) => (
                  <Pressable
                    key={session.sessionId}
                    testID={`honorari-session-${session.sessionId}`}
                    accessibilityRole="button"
                    android_ripple={null}
                    className="active:opacity-70"
                    onPress={() =>
                      router.push({
                        pathname: "/(admin)/izvestaji/honorari/sesija/[sessionId]",
                        params: {
                          sessionId: session.sessionId,
                          trainerId: params.trainerId,
                          year: String(cursor.year),
                          month: String(cursor.month),
                        },
                      })
                    }
                  >
                    <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
                      <View className="flex-row items-center gap-3 px-4 py-3.5">
                        <View className="flex-1">
                          <Text
                            className="text-foreground font-body-medium"
                            style={{ fontSize: 16 }}
                            numberOfLines={1}
                          >
                            {session.classTypeName}
                          </Text>
                          <Text className="text-muted mt-0.5" style={{ fontSize: 13 }}>
                            {new Date(session.startsAt).toLocaleString(getDateLocale(), {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {t("payroll.attendeesShort", {
                              count: session.attendees.length,
                            })}
                          </Text>
                          {session.unpricedCount > 0 && (
                            <Text
                              className="mt-0.5"
                              style={{ fontSize: 12, color: tokens.warning }}
                            >
                              {t("payroll.unpricedWarning", {
                                count: session.unpricedCount,
                              })}
                            </Text>
                          )}
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <Text
                            className="font-body-medium"
                            style={{ fontSize: 15, color: tokens.foreground }}
                          >
                            {formatRsd(session.gross)}
                          </Text>
                          <Icon name="chevron-right" size={11} color="#52525b" />
                        </View>
                      </View>
                    </GlassCard>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}

