/**
 * Izveštaji → Honorari → one trainer's month → one held session.
 *
 * Everything the owner needs to justify what a single training was worth:
 * every attendee in full, the package each came on, and that package's
 * per-session value. The month screen deliberately keeps only a total, since
 * names do not fit — and do not belong — in a summary row.
 *
 * Values here are the frozen ones (see `recordConsumption`): what the session
 * was worth when it happened, not what today's price list would make of it.
 */
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import {
  confirmTrialMutationOptions,
  payrollQueries,
} from "@/lib/queries/payroll-queries-factory";
import { formatMutationError } from "@/lib/admin/format-mutation-error";
import { defaultPayrollMonth } from "@/lib/payroll-month-nav";
import { formatRsd } from "@/lib/format";
import { getDateLocale } from "@/lib/i18n";

export default function HonorariSessionDetail() {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const params = useLocalSearchParams<{
    sessionId: string;
    trainerId: string;
    year?: string;
    month?: string;
  }>();

  const fallback = defaultPayrollMonth();
  const cursor = {
    year: Number(params.year) || fallback.year,
    month: Number(params.month) || fallback.month,
  };

  // The month payload already carries every session's attendees, so this page
  // reads the same cached query instead of adding an endpoint that would
  // duplicate the valuation rules.
  const monthQuery = useQuery(
    payrollQueries.month({ ...cursor, trainerUserId: params.trainerId }),
  );

  const session = monthQuery.data?.month.sessions.find(
    (s) => s.sessionId === params.sessionId,
  );

  // One mutation for the whole page, but its pending/error state belongs to
  // the line it was fired from — `variables` names that line, so a failure on
  // one attendee does not put a message under every other one.
  const confirmTrial = useMutation(confirmTrialMutationOptions(queryClient));
  const pendingBookingId = confirmTrial.isPending
    ? confirmTrial.variables?.bookingId
    : undefined;
  const failedBookingId = confirmTrial.isError
    ? confirmTrial.variables?.bookingId
    : undefined;

  return (
    <ScreenContainerRaw
      headerVariant="detail"
      title={session?.classTypeName ?? t("payroll.session")}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
        {monthQuery.isError ? (
          <ErrorState
            message={monthQuery.error.message}
            testID="honorari-session-error"
          />
        ) : monthQuery.isLoading ? (
          <SkeletonList count={3} />
        ) : !session ? (
          <EmptyState title={t("payroll.sessionNotFound")} />
        ) : (
          <>
            <GlassCard className="p-4">
              <CapsLabel>{t("payroll.sessionValue")}</CapsLabel>
              <Text
                className="mt-1 text-3xl font-semibold"
                style={{ color: tokens.foreground }}
                testID="honorari-session-gross"
              >
                {formatRsd(session.gross)}
              </Text>
              <Text className="text-muted mt-1" style={{ fontSize: 13 }}>
                {new Date(session.startsAt).toLocaleString(getDateLocale(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              {session.unpricedCount > 0 && (
                <Text
                  className="mt-2 text-sm"
                  style={{ color: tokens.warning }}
                  testID="honorari-session-unpriced"
                >
                  {t("payroll.unpricedWarning", { count: session.unpricedCount })}
                </Text>
              )}
            </GlassCard>

            <CapsLabel>
              {t("payroll.attendeesShort", { count: session.attendees.length })}
            </CapsLabel>

            {session.attendees.length === 0 ? (
              <EmptyState title={t("payroll.noAttendees")} />
            ) : (
              session.attendees.map((attendee) => (
                <GlassCard
                  key={attendee.bookingId}
                  style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}
                >
                  <View className="gap-1 px-4 py-3.5">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text
                        className="text-foreground font-body-medium flex-1"
                        style={{ fontSize: 16 }}
                        testID={`honorari-attendee-${attendee.bookingId}`}
                      >
                        {attendee.clientName}
                      </Text>
                      <Text
                        className="font-body-medium"
                        style={{
                          fontSize: 15,
                          color:
                            attendee.sessionValue === null
                              ? tokens.warning
                              : tokens.foreground,
                        }}
                      >
                        {attendee.sessionValue === null
                          ? t("payroll.noPackageValue")
                          : formatRsd(attendee.sessionValue)}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      {/* A trial carries a value but no package, so the slot
                          that normally names the package names the trial. */}
                      <Text className="text-muted flex-1" style={{ fontSize: 13 }}>
                        {attendee.isTrial
                          ? t("payroll.trialLabel")
                          : attendee.sessionValue === null
                            ? t("payroll.noPackageHint")
                            : attendee.packageName}
                      </Text>
                      {attendee.isTrial && (
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: tokens.accentSoft }}
                        >
                          <Text
                            className="text-[10px] font-medium"
                            style={{ color: tokens.accent }}
                          >
                            {t("payroll.trial")}
                          </Text>
                        </View>
                      )}
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

                    {attendee.canConfirmTrial && (
                      <View className="mt-2 gap-1">
                        <Button
                          size="small"
                          variant="secondary"
                          testID={`confirm-trial-${attendee.bookingId}`}
                          disabled={pendingBookingId === attendee.bookingId}
                          onPress={() =>
                            confirmTrial.mutate({
                              bookingId: attendee.bookingId,
                            })
                          }
                        >
                          {t("payroll.confirmTrial")}
                        </Button>
                        {failedBookingId === attendee.bookingId && (
                          <Text
                            className="text-sm"
                            style={{ color: tokens.danger }}
                            testID={`confirm-trial-error-${attendee.bookingId}`}
                          >
                            {formatMutationError(
                              confirmTrial.error,
                              t,
                              i18n.language === "en" ? "en" : "sr",
                              t("payroll.confirmTrialError"),
                            )}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </GlassCard>
              ))
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
