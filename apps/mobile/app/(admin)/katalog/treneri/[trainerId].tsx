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
import { decimalSeparator, getDateLocale } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { now } from "@/lib/now";

export default function TrainerRates() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const params = useLocalSearchParams<{ trainerId: string }>();
  const trainerUserId = params.trainerId;

  /**
   * Both sheets stay MOUNTED and close by driving `open` to false, so
   * AppSheet's dismiss reconciliation actually runs. Unmounting a presented
   * gorhom modal skips it and leaves the sheet wedged in the modal host —
   * which is what made a reopened class type show its pre-revert state.
   *
   * Because they stay mounted, `editing` holds the scope even while the sheet
   * animates shut: `open` is what closes it, not the absence of a scope.
   */
  const [editing, setEditing] = useState<{
    /** Null scope = the base rate; a scope = that class type's override. */
    scope: RateSheetScope | null;
    open: boolean;
    /**
     * What the admin has TYPED, or null while the field is untouched.
     *
     * Null rather than a value captured when the sheet opened: the seed is
     * derived below from the live rates on every render, so a class type
     * reopened after its override was tombstoned reads the tombstone instead
     * of the percentage that was just ended.
     */
    typed: string | null;
  }>({ scope: null, open: false, typed: null });
  const [reverting, setReverting] = useState<{
    scope: RateSheetScope | null;
    open: boolean;
  }>({ scope: null, open: false });

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

  const openRate = (scope: RateSheetScope | null) =>
    setEditing({ scope, open: true, typed: null });

  /**
   * The percentage in force for the scope on show, in the separator the admin
   * will type back — editing "22,5" must not require retyping it as "22.5".
   *
   * Derived on every render rather than captured when the sheet opened. The
   * sheet is mounted for the life of the screen (unmounting a presented modal
   * wedges it), and the handler that opens it can be holding a render's worth
   * of stale rates, so reading the rates HERE is what makes a reopened sheet
   * honest: a tombstoned class type has no percent of its own, and the field
   * comes back empty rather than showing the override that was just ended.
   */
  const editingSeed = currentTrainerRate(
    rates,
    trainerUserId,
    editing.scope?.classTypeId ?? null,
  )?.percent;
  const editingPercent =
    editing.typed ??
    (editingSeed == null
      ? ""
      : String(editingSeed).replace(".", decimalSeparator()));

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
              onPress={() => openRate(null)}
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
                      {defaultRate?.percent != null
                        ? formatPercent(defaultRate.percent)
                        : "—"}
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
                // ONE tap target, end to end. The row used to carry a second
                // "Vrati na osnovni procenat" press area, which was the only
                // labelled text on it — so reverting read as the only thing
                // an admin could do here and changing the percentage looked
                // impossible. Reverting now lives inside the sheet the row
                // opens.
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
                    onPress={() => openRate(scope)}
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
                              ? formatPercent(percent)
                              : t("payroll.inheritedPercent", {
                                  percent: formatPercent(percent).replace("%", ""),
                                })}
                        </Text>
                        <Icon name="chevron-right" size={11} color="#52525b" />
                      </View>
                    </View>
                  </Pressable>
                </GlassCard>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Mounted for the life of the screen. Closing is `open=false`, never an
          unmount — see the state comment above. */}
      <RateSheet
        open={editing.open}
        onOpenChange={(open) =>
          !open && setEditing((prev) => ({ ...prev, open: false }))
        }
        trainerUserId={trainerUserId}
        trainerName={trainerName}
        rates={rates}
        scope={editing.scope}
        percent={editingPercent}
        onPercentChange={(typed) => setEditing((prev) => ({ ...prev, typed }))}
        // Only a scope that is actually overridden has anything to hand back;
        // the base rate has no base to fall back to. Read from the live rates,
        // so a sheet reopened after the revert refetch knows it is gone.
        canRevert={
          editing.scope
            ? hasLiveOverride(rates, trainerUserId, editing.scope.classTypeId, at)
            : false
        }
        // The scope comes back from the sheet rather than out of this
        // closure: the sheet is the thing that knows which one it is showing,
        // and the compiler can hand this handler a render-old `editing`.
        onRevert={(scope) => {
          // Advance to the confirm step: the two sheets swap rather than
          // stack, so the revert date is asked for on a screen of its own.
          setEditing((prev) => ({ ...prev, open: false }));
          setReverting({ scope, open: true });
        }}
      />

      <RevertRateSheet
        open={reverting.open}
        onOpenChange={(open) =>
          !open && setReverting((prev) => ({ ...prev, open: false }))
        }
        trainerUserId={trainerUserId}
        classTypeId={reverting.scope?.classTypeId ?? ""}
        classTypeName={reverting.scope?.classTypeName ?? ""}
      />
    </ScreenContainerRaw>
  );
}
