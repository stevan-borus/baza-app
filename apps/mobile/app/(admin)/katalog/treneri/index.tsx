/**
 * Katalog → Treneri.
 *
 * The studio's trainer roster: who trains here, what each one's commission is,
 * and who has been invited but not yet joined. Rates are append-only — setting
 * a new one records it from a date rather than editing the old value, so a
 * raise in March cannot silently rewrite what February already paid.
 *
 * A row shows the BASE percentage and opens the trainer's rates screen, where
 * the per-class-type agreements live. The row can't show them all — a trainer
 * on four different splits would need four numbers — so it says how many there
 * are, and the screen behind it says what they are.
 *
 * Onboarding starts here rather than behind the client list, from the header
 * `+` every other roster screen uses: the pending invites sit next to the
 * people they will become.
 *
 * The roster reads the ADMIN staff endpoint rather than the trainer picker's
 * list, because it is also the only screen that surfaces a sign-in lock on
 * staff — and admins, who have no rate and so never appeared here, are the
 * people most likely to need one lifted by a colleague.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { HeaderIconButton } from "@/components/ui/app-header";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import {
  adminUsersQueries,
  useUnlockUserMutation,
  type AdminUser,
} from "@/lib/queries/admin-users-queries-factory";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { InviteTrainerSheet } from "@/components/admin/trainer-flows/invite-trainer-sheet";
import { TrainerInvitesSection } from "@/components/admin/trainer-flows/trainer-invites-section";
import { currentTrainerRate, hasLiveOverride } from "@/lib/trainer-rate-selection";
import { formatTime } from "@/lib/format-date";
import { now, nowMs } from "@/lib/now";

/**
 * The lock instant if it is still ahead of us, else null.
 *
 * The server only sends future instants, but a cached payload can outlive
 * one, and a padlock nobody can explain — sign-in already lets them through —
 * is worse than none. Returning the instant rather than a boolean lets the
 * caller hand it straight to the badge with no non-null assertion.
 */
function liveLockInstant(user: AdminUser): string | null {
  if (user.lockedUntil == null) return null;
  return Date.parse(user.lockedUntil) > nowMs() ? user.lockedUntil : null;
}

/**
 * The lock badge + its unlock action, shared by the trainer rows and the
 * admin rows.
 *
 * Rendered as a SIBLING of the trainer row's Pressable, never inside it: RN
 * has no stopPropagation, so a button nested in a pressable card fires both
 * handlers and the admin gets navigated away every time they clear a lock.
 */
function LockRow({ user, lockedUntil }: { user: AdminUser; lockedUntil: string }) {
  const { t, i18n } = useTranslation();
  const unlock = useUnlockUserMutation();
  const lang = i18n.language === "sr" ? "sr" : "en";

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Badge status="warning">
          <Text testID={`tim-locked-badge-${user.id}`}>
            {t("admin.trainers.lockedUntil", {
              time: formatTime(lockedUntil, lang),
            })}
          </Text>
        </Badge>
        <Button
          testID={`tim-unlock-button-${user.id}`}
          variant="secondary"
          size="small"
          disabled={unlock.isPending}
          accessibilityLabel={t("admin.trainers.unlockA11y", {
            name: user.fullName,
          })}
          onPress={() => unlock.mutate({ id: user.id })}
        >
          {t("admin.trainers.unlock")}
        </Button>
      </View>
      {unlock.isError ? (
        <ErrorState
          message={t("admin.trainers.unlockError")}
          testID={`tim-unlock-error-${user.id}`}
        />
      ) : null}
    </View>
  );
}

export default function Treneri() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);

  const [inviteOpen, setInviteOpen] = useState(false);

  const staffQuery = useQuery(adminUsersQueries.list());
  const ratesQuery = useQuery(payrollQueries.rates());
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  // A rate only means something for an actual TRAINER — the API rejects one
  // for anyone else — so admins get their own section instead of a rate row.
  const staff = staffQuery.data?.users ?? [];
  const trainers = staff.filter((u) => u.role === "TRAINER");
  const admins = staff.filter((u) => u.role === "ADMIN");
  const rates = ratesQuery.data?.rates ?? [];
  const classTypes = classTypesQuery.data?.classTypes ?? [];
  const at = now();

  const overrideCount = (trainerUserId: string) =>
    classTypes.filter((classType) => hasLiveOverride(rates, trainerUserId, classType.id, at))
      .length;

  return (
    <ScreenContainerRaw
      title={t("admin.trainers.screenTitle")}
      headerVariant="detail"
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setInviteOpen(true)}
          testID="trainer-invite-open-button"
          accessibilityLabel={t("admin.trainers.inviteCtaA11y")}
        />
      }
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

        {staffQuery.isError || ratesQuery.isError ? (
          <ErrorState
            message={(staffQuery.error ?? ratesQuery.error)?.message ?? ""}
            testID="procenti-error"
          />
        ) : staffQuery.isLoading || ratesQuery.isLoading ? (
          <View style={{ gap: 8 }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : trainers.length === 0 ? (
          <EmptyState title={t("payroll.noTrainers")} />
        ) : (
          trainers.map((trainer, idx) => {
            const rate = currentTrainerRate(rates, trainer.id);
            const overrides = overrideCount(trainer.id);
            const lockedUntil = liveLockInstant(trainer);
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
                  onPress={() =>
                    router.push({
                      pathname: "/(admin)/katalog/treneri/[trainerId]",
                      params: { trainerId: trainer.id },
                    })
                  }
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
                              rate.effectiveFrom
                            ).toLocaleDateString(getDateLocale())}`}
                          </Text>
                        ) : (
                          <Text className="mt-0.5" style={{ fontSize: 13, color: tokens.warning }}>
                            {t("payroll.noRateHint")}
                          </Text>
                        )}
                      </View>

                      <View className="flex-row items-center gap-1.5">
                        {overrides > 0 && (
                          <View
                            className="rounded-full px-2 py-0.5"
                            style={{ backgroundColor: tokens.accentSoft }}
                            testID={`procenti-overrides-hint-${trainer.id}`}
                            accessibilityLabel={t("payroll.overridesHintA11y", {
                              count: overrides,
                            })}
                          >
                            <Text className="text-xs font-medium" style={{ color: tokens.accent }}>
                              {t("payroll.overridesHint", { count: overrides })}
                            </Text>
                          </View>
                        )}
                        <Text
                          className="font-body-medium"
                          style={{
                            fontSize: 15,
                            color: rate ? tokens.foreground : tokens.warning,
                          }}
                          testID={`procenti-value-${trainer.id}`}
                        >
                          {rate?.percent != null ? formatPercent(rate.percent) : "—"}
                        </Text>
                        <Icon name="chevron-right" size={11} color="#52525b" />
                      </View>
                    </View>
                  </GlassCard>
                </Pressable>
                {lockedUntil ? (
                  <View className="mt-1.5">
                    <LockRow user={trainer} lockedUntil={lockedUntil} />
                  </View>
                ) : null}
              </MotiView>
            );
          })
        )}

        {admins.length > 0 ? (
          <View className="mt-4 gap-2">
            <SectionLabel testID="tim-admins-section-label">
              {t("admin.trainers.adminsTitle")} · {admins.length}
            </SectionLabel>
            {admins.map((admin) => {
              const lockedUntil = liveLockInstant(admin);
              return (
                <View key={admin.id} className="gap-1.5">
                  <GlassCard style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
                    {/* Not pressable: an admin has no rates screen behind them. */}
                    <View testID={`tim-admin-row-${admin.id}`} className="px-4 py-3.5">
                      <Text
                        className="text-foreground font-body-medium"
                        style={{ fontSize: 16 }}
                        numberOfLines={1}
                      >
                        {admin.fullName}
                      </Text>
                      <Text
                        className="text-muted mt-0.5"
                        style={{ fontSize: 13 }}
                        numberOfLines={1}
                      >
                        {admin.email}
                      </Text>
                    </View>
                  </GlassCard>
                  {lockedUntil ? <LockRow user={admin} lockedUntil={lockedUntil} /> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View className="mt-4">
          <TrainerInvitesSection />
        </View>
      </ScrollView>

      <InviteTrainerSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </ScreenContainerRaw>
  );
}
