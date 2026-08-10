/**
 * Izveštaji → Honorari → one trainer's month.
 *
 * The auditable breakdown the owner pays from: every held session, who
 * attended it, which package each attendee was on and what that session was
 * worth to them. Locking freezes those figures; adjustments correct them
 * without touching the underlying data.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { MonthStepper } from "@/components/payroll/month-stepper";
import {
  lockPayrollPeriodMutationOptions,
  payrollQueries,
} from "@/lib/queries/payroll-queries-factory";
import {
  defaultPayrollMonth,
  formatMonthLabel,
  type PayrollMonthCursor,
} from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";
import { formatMutationError } from "@/lib/admin/format-mutation-error";

export default function HonorariTrainerDetail() {
  const { t, i18n } = useTranslation();
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
  const [confirmLock, setConfirmLock] = useState<null | "lock" | "unlock">(null);

  const monthQuery = useQuery(
    payrollQueries.month({ ...cursor, trainerUserId: params.trainerId }),
  );
  const lockMutation = useMutation(lockPayrollPeriodMutationOptions(queryClient));

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: payrollQueries.all });
    setRefreshing(false);
  }

  const month = monthQuery.data?.month;
  const isLocked = month?.status === "LOCKED";
  // An unpriced attendance cannot be frozen into a money figure, so the server
  // refuses the lock — surface that here instead of letting the user discover
  // it via an error toast.
  const lockBlocked = (month?.unpricedCount ?? 0) > 0;

  return (
    <ScreenContainerRaw>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="mb-4 flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.a11yGoBack")}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl"
            testID="honorari-detail-back"
          >
            <Icon name="chevron-left" size={22} color={tokens.foreground} />
          </Pressable>
          <View className="flex-1">
            <Text
              className="text-2xl font-semibold"
              style={{ color: tokens.foreground }}
              testID="honorari-detail-name"
            >
              {month?.trainerName ?? t("payroll.trainer")}
            </Text>
            <Text className="text-sm" style={{ color: tokens.muted }}>
              {formatMonthLabel(cursor, i18n.language)}
            </Text>
          </View>
        </View>

        <View className="mb-4">
          <MonthStepper cursor={cursor} onChange={setCursor} />
        </View>

        {monthQuery.isError ? (
          <ErrorState message={monthQuery.error.message} testID="honorari-detail-error" />
        ) : monthQuery.isLoading || !month ? (
          <SkeletonList count={4} />
        ) : (
          <>
            <GlassCard className="mb-4 p-4">
              <View className="flex-row items-end justify-between">
                <View>
                  <CapsLabel>{t("payroll.netPayout")}</CapsLabel>
                  <Text
                    className="mt-1 text-3xl font-semibold"
                    style={{ color: tokens.foreground }}
                    testID="honorari-detail-payout"
                  >
                    {formatRsd(month.netPayout)}
                  </Text>
                </View>
                <View
                  className="rounded-full px-3 py-1"
                  style={{
                    backgroundColor: isLocked ? tokens.successSoft : tokens.surface2,
                  }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: isLocked ? tokens.success : tokens.muted }}
                    testID="honorari-detail-status"
                  >
                    {isLocked ? t("payroll.statusLocked") : t("payroll.statusOpen")}
                  </Text>
                </View>
              </View>

              <View className="mt-3 gap-1">
                <SummaryRow
                  label={t("payroll.gross")}
                  value={formatRsd(month.gross)}
                />
                <SummaryRow
                  label={t("payroll.percent")}
                  value={month.percent === null ? t("payroll.noRate") : `${month.percent}%`}
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

            <View className="mb-4">
              <Button
                variant={isLocked ? "secondary" : "primary"}
                disabled={!isLocked && (lockBlocked || month.percent === null)}
                onPress={() => setConfirmLock(isLocked ? "unlock" : "lock")}
                testID="honorari-lock-button"
              >
                {isLocked ? t("payroll.unlockPeriod") : t("payroll.lockPeriod")}
              </Button>
              <Text className="mt-2 text-xs" style={{ color: tokens.muted }}>
                {lockBlocked && !isLocked
                  ? t("payroll.unpricedBlocksLock")
                  : t("payroll.lockHint")}
              </Text>
            </View>

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
                      <Text
                        className="text-base font-semibold"
                        style={{ color: tokens.foreground }}
                      >
                        {formatRsd(session.gross)}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-xs" style={{ color: tokens.muted }}>
                      {new Date(session.startsAt).toLocaleString(i18n.language, {
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
                          <View className="flex-1 flex-row items-center gap-2 pr-2">
                            <Text
                              className="text-sm"
                              style={{ color: tokens.foreground }}
                              numberOfLines={1}
                            >
                              {attendee.clientName}
                            </Text>
                            {attendee.isGift && (
                              <View
                                className="rounded-full px-2 py-0.5"
                                style={{ backgroundColor: tokens.accentSoft }}
                              >
                                <Text
                                  className="text-[10px] font-medium"
                                  style={{ color: tokens.accent }}
                                >
                                  {t("payroll.gift")}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-xs" style={{ color: tokens.muted }}>
                            {attendee.packageName}
                          </Text>
                          <Text
                            className="ml-3 w-24 text-right text-sm"
                            style={{
                              color:
                                attendee.sessionValue === null
                                  ? tokens.warning
                                  : tokens.foreground,
                            }}
                          >
                            {attendee.sessionValue === null
                              ? "—"
                              : formatRsd(attendee.sessionValue)}
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

      <ConfirmSheet
        open={confirmLock !== null}
        onOpenChange={(open) => !open && setConfirmLock(null)}
        title={
          confirmLock === "unlock"
            ? t("payroll.unlockPeriod")
            : t("payroll.lockPeriod")
        }
        message={
          confirmLock === "unlock"
            ? t("payroll.unlockConfirm")
            : t("payroll.lockConfirm")
        }
        confirmLabel={
          confirmLock === "unlock"
            ? t("payroll.unlockPeriod")
            : t("payroll.lockPeriod")
        }
        tone={confirmLock === "unlock" ? "danger" : "primary"}
        loading={lockMutation.isPending}
        errorMessage={
          lockMutation.error
            ? formatMutationError(
                lockMutation.error,
                t,
                i18n.language === "en" ? "en" : "sr",
                t("payroll.lockHint"),
              )
            : null
        }
        testID="honorari-lock-confirm"
        onConfirm={async () => {
          await lockMutation.mutateAsync({
            trainerUserId: params.trainerId,
            year: cursor.year,
            month: cursor.month,
            unlock: confirmLock === "unlock",
          });
          setConfirmLock(null);
        }}
      />
    </ScreenContainerRaw>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const tokens = useThemeTokens();
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm" style={{ color: tokens.muted }}>
        {label}
      </Text>
      <Text className="text-sm font-medium" style={{ color: tokens.foreground }}>
        {value}
      </Text>
    </View>
  );
}
