/**
 * Katalog → Treneri → one trainer's percentages.
 *
 * A trainer's cut is not one number. An individual or a duo is worth a
 * different percentage to the studio than a group slot, so the screen is a
 * base rate followed by every class type: the ones with their own agreement
 * state it plainly, and the rest show the base marked as inherited. Showing
 * only the negotiated ones would leave the admin guessing what the others pay;
 * showing them all unmarked would make an inherited figure look like a
 * decision someone made.
 *
 * Nothing here deletes. Ending an override appends a dated tombstone, because
 * the history is what settled months were paid from.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { GlassCard } from "@/components/ui/glass-card";
import { ErrorState } from "@/components/ui/states";
import { SkeletonList } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import {
  RateSheet,
  RevertRateSheet,
  type RateSheetScope,
} from "@/components/admin/trainer-flows/rate-sheet";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import {
  currentTrainerRate,
  effectiveTrainerPercentFor,
  hasLiveOverride,
} from "@/lib/trainer-rate-selection";
import { getDateLocale } from "@/lib/i18n";
import { now } from "@/lib/now";

export default function TrainerRates() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const params = useLocalSearchParams<{ trainerId: string }>();
  const trainerUserId = params.trainerId;

  /** Null scope = the base rate; a scope = that class type's override. */
  const [editing, setEditing] = useState<RateSheetScope | null | undefined>(
    undefined,
  );
  const [reverting, setReverting] = useState<RateSheetScope | null>(null);

  const trainersQuery = useQuery(usersQueries.trainers());
  const ratesQuery = useQuery(payrollQueries.rates());
  const classTypesQuery = useQuery(trainingsQueries.classTypes());

  const rates = ratesQuery.data?.rates ?? [];
  const trainer = (trainersQuery.data?.users ?? []).find(
    (u) => u.id === trainerUserId,
  );
  const trainerName = trainer?.fullName ?? t("payroll.trainer");
  const at = now();

  // Alphabetical: the catalog's own order is creation order, which tells the
  // admin nothing when they are hunting for one class type in a list.
  const classTypes = [...(classTypesQuery.data?.classTypes ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, getDateLocale()),
  );

  const defaultRate = currentTrainerRate(rates, trainerUserId);
  const isLoading =
    ratesQuery.isLoading || classTypesQuery.isLoading || trainersQuery.isLoading;
  const error = ratesQuery.error ?? classTypesQuery.error ?? trainersQuery.error;

  return (
    <ScreenContainerRaw headerVariant="detail" title={trainerName}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
        {error ? (
          <ErrorState message={error.message} testID="procenti-error" />
        ) : isLoading ? (
          <SkeletonList count={4} />
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("payroll.baseRateA11y", {
                name: trainerName,
              })}
              testID="procenti-default-row"
              onPress={() => setEditing(null)}
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
                      {t("payroll.baseRate")}
                    </Text>
                    {defaultRate ? (
                      <Text className="text-muted mt-0.5" style={{ fontSize: 13 }}>
                        {`${t("payroll.effectiveFrom")} ${new Date(
                          defaultRate.effectiveFrom,
                        ).toLocaleDateString(getDateLocale())}`}
                      </Text>
                    ) : (
                      <Text
                        className="mt-0.5"
                        style={{ fontSize: 13, color: tokens.warning }}
                      >
                        {t("payroll.noRateHint")}
                      </Text>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="font-body-medium"
                      style={{
                        fontSize: 15,
                        color: defaultRate ? tokens.foreground : tokens.warning,
                      }}
                      testID="procenti-default-value"
                    >
                      {defaultRate ? `${defaultRate.percent}%` : "—"}
                    </Text>
                    <Icon name="chevron-right" size={11} color="#52525b" />
                  </View>
                </View>
              </GlassCard>
            </Pressable>

            <View className="mt-3">
              <SectionLabel>{t("payroll.specialRates")}</SectionLabel>
            </View>

            {classTypes.map((classType) => {
              const overridden = hasLiveOverride(
                rates,
                trainerUserId,
                classType.id,
                at,
              );
              const percent = effectiveTrainerPercentFor(
                rates,
                trainerUserId,
                classType.id,
                at,
              );
              const scope: RateSheetScope = {
                classTypeId: classType.id,
                classTypeName: classType.name,
              };
              return (
                // The revert action is a SIBLING of the row press target, not
                // a child: nesting one button inside another is invalid on web
                // and the outer one swallows the inner tap.
                <GlassCard
                  key={classType.id}
                  style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("payroll.classTypeRateA11y", {
                      classType: classType.name,
                    })}
                    testID={`procenti-class-type-row-${classType.id}`}
                    onPress={() => setEditing(scope)}
                    android_ripple={null}
                    className="active:opacity-70"
                  >
                    <View className="flex-row items-center gap-3.5 px-4 py-3.5">
                      <Text
                        className="text-foreground font-body-medium flex-1"
                        style={{ fontSize: 16 }}
                        numberOfLines={1}
                      >
                        {classType.name}
                      </Text>
                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className="font-body-medium"
                          style={{
                            fontSize: 15,
                            // An inherited figure is dimmed and qualified; a
                            // negotiated one reads at full weight, so the two
                            // are never mistaken for each other.
                            color: overridden ? tokens.foreground : tokens.muted,
                          }}
                        >
                          {percent === null
                            ? "—"
                            : overridden
                              ? `${percent}%`
                              : t("payroll.inheritedPercent", { percent })}
                        </Text>
                        <Icon name="chevron-right" size={11} color="#52525b" />
                      </View>
                    </View>
                  </Pressable>

                  {overridden && (
                    <Pressable
                      accessibilityRole="button"
                      testID={`procenti-revert-${classType.id}`}
                      onPress={() => setReverting(scope)}
                      android_ripple={null}
                      className="active:opacity-70"
                    >
                      <View className="px-4 pb-3">
                        <Text className="text-xs" style={{ color: tokens.muted }}>
                          {t("payroll.revertToBase")}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                </GlassCard>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Remounting per scope is what seeds the form from that scope's current
          rate — no effect syncing state to props. */}
      {editing !== undefined && (
        <RateSheet
          key={editing?.classTypeId ?? "default"}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
          trainerUserId={trainerUserId}
          trainerName={trainerName}
          rates={rates}
          scope={editing}
        />
      )}

      {reverting && (
        <RevertRateSheet
          key={`revert-${reverting.classTypeId}`}
          open
          onOpenChange={(open) => !open && setReverting(null)}
          trainerUserId={trainerUserId}
          classTypeId={reverting.classTypeId}
          classTypeName={reverting.classTypeName}
        />
      )}
    </ScreenContainerRaw>
  );
}
