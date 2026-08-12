/**
 * Trainer → Moja zarada.
 *
 * The trainer's own month: sessions held, who was there, and what they earned.
 * The server derives the trainer from the session — this screen never sends a
 * trainer id — so there is no path from here to another trainer's figures.
 *
 * Shows the SAME breakdown the admin sees for this trainer — gross, percent,
 * sessions, attendees — because a payout figure a trainer cannot check is a
 * figure they have to take on trust.
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
import { SummaryRow } from "@/components/payroll/summary-row";
import { Button } from "@/components/ui/button";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { defaultPayrollMonth, type PayrollMonthCursor } from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";

const PAGE_SIZE = 30;

export default function TrainerZarada() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [cursor, setCursor] = useState<PayrollMonthCursor>(defaultPayrollMonth);
  const [refreshing, setRefreshing] = useState(false);
  // A busy month runs to ~70 sessions; render them a page at a time like the
  // admin list does rather than mounting every card at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // No trainerUserId: "my own month" is the only form a trainer may request.
  const monthQuery = useQuery(payrollQueries.month(cursor));

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: payrollQueries.all });
    setRefreshing(false);
  }

  const month = monthQuery.data?.month;
  const sessions = month?.sessions ?? [];
  const visibleSessions = sessions.slice(0, visibleCount);
  const hasMore = sessions.length > visibleCount;
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
          <MonthStepper cursor={cursor} onChange={(next) => {
            setCursor(next);
            setVisibleCount(PAGE_SIZE);
          }} />
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

              {/* Same breakdown the admin sees for this trainer. Showing the
                  payout without the gross and the percentage behind it asked
                  the trainer to trust a number they cannot check — and it is
                  their own pay, agreed with them. */}
              <View className="mt-3 gap-1">
                <SummaryRow
                  label={t("payroll.gross")}
                  value={formatRsd(month.gross)}
                />
                <SummaryRow
                  label={t("payroll.percent")}
                  value={
                    month.percent === null
                      ? t("payroll.noRate")
                      : `${month.percent}%`
                  }
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
            {sessions.length === 0 ? (
              <EmptyState title={t("payroll.noSessions")} />
            ) : (
              <View className="mt-2 gap-3">
                {visibleSessions.map((session) => (
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

                {hasMore && (
                  <Button
                    variant="secondary"
                    testID="zarada-load-more"
                    onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  >
                    {t("payroll.loadMore", {
                      count: sessions.length - visibleCount,
                    })}
                  </Button>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
