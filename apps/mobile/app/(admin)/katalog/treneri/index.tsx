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
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/i18n";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import { HeaderIconButton } from "@/components/ui/app-header";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import { InviteTrainerSheet } from "@/components/admin/trainer-flows/invite-trainer-sheet";
import { TrainerInvitesSection } from "@/components/admin/trainer-flows/trainer-invites-section";
import {
  currentTrainerRate,
  hasLiveOverride,
} from "@/lib/trainer-rate-selection";
import { now } from "@/lib/now";

export default function Treneri() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);

  const [inviteOpen, setInviteOpen] = useState(false);

  const trainersQuery = useQuery(usersQueries.trainers());
  const ratesQuery = useQuery(payrollQueries.rates());
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  // The trainers endpoint also returns admins (it feeds session assignment);
  // a rate only means something for an actual TRAINER, and the API rejects
  // anyone else.
  const trainers = (trainersQuery.data?.users ?? []).filter(
    (u) => u.role === "TRAINER",
  );
  const rates = ratesQuery.data?.rates ?? [];
  const classTypes = classTypesQuery.data?.classTypes ?? [];
  const at = now();

  const overrideCount = (trainerUserId: string) =>
    classTypes.filter((classType) =>
      hasLiveOverride(rates, trainerUserId, classType.id, at),
    ).length;

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

        {trainersQuery.isError || ratesQuery.isError ? (
          <ErrorState
            message={(trainersQuery.error ?? ratesQuery.error)?.message ?? ""}
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
            const rate = currentTrainerRate(rates, trainer.id);
            const overrides = overrideCount(trainer.id);
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
                              rate.effectiveFrom,
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
                            <Text
                              className="text-xs font-medium"
                              style={{ color: tokens.accent }}
                            >
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

        <View className="mt-4">
          <TrainerInvitesSection />
        </View>
      </ScrollView>

      <InviteTrainerSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </ScreenContainerRaw>
  );
}
