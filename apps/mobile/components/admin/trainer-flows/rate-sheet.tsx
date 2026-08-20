/**
 * The sheet that records a trainer's commission — either their base percentage
 * or one class type's override.
 *
 * A rate is never edited in place: saving appends a row effective from a date,
 * so a raise in March cannot silently rewrite what February already paid. The
 * history below the form is the trail of what has been agreed, newest first.
 *
 * The `scope` prop is the whole difference between the two modes. Absent, the
 * POST omits `classTypeId` and the row becomes the trainer's default; present,
 * the row applies to that class type alone and the title names it, because a
 * sheet that looks identical in both modes is a sheet that will be saved into
 * the wrong scope.
 */
import { useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSheet } from "@/components/ui/sheet";
import { CapsLabel } from "@/components/ui/studio";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useThemeTokens } from "@/components/ui/tokens";
import { createTrainerRateMutationOptions } from "@/lib/queries/payroll-queries-factory";
import { formatMutationError } from "@/lib/admin/format-mutation-error";
import {
  currentTrainerRate,
  trainerRateHistory,
  type TrainerRateRow,
} from "@/lib/trainer-rate-selection";
import { decimalSeparator, getDateLocale } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { now } from "@/lib/now";

export type RateSheetScope = {
  classTypeId: string;
  classTypeName: string;
};

export type RateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainerUserId: string;
  trainerName: string;
  rates: TrainerRateRow[];
  /** Omitted = the trainer's base percentage. */
  scope?: RateSheetScope | null;
  /**
   * Whether this scope currently carries a live override — i.e. whether there
   * is anything to hand back to the base rate. False on the base sheet: there
   * is no base to fall back to.
   */
  canRevert?: boolean;
  /** Advance to the confirm step that ends the override. */
  onRevert?: () => void;
};

export function RateSheet({
  open,
  onOpenChange,
  trainerUserId,
  trainerName,
  rates,
  scope = null,
  canRevert = false,
  onRevert,
}: RateSheetProps) {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const createRate = useMutation(createTrainerRateMutationOptions(queryClient));

  const classTypeId = scope?.classTypeId ?? null;
  const history = trainerRateHistory(rates, trainerUserId, classTypeId);

  // Remounting per open (see the `key` at every call site) is what seeds the
  // form from the scope's current rate without an effect syncing state to
  // props.
  const [percent, setPercent] = useState(() => {
    const current = currentTrainerRate(rates, trainerUserId, classTypeId)?.percent;
    // Seeded in the separator the admin will type back — editing "22,5" must
    // not require retyping it as "22.5".
    return current == null ? "" : String(current).replace(".", decimalSeparator());
  });
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(() => now());
  const [note, setNote] = useState("");

  // The studio types 22,5 — a comma is what a Serbian keyboard puts under the
  // thumb — so both separators parse to the same rate.
  const parsedPercent = Number(percent.trim().replace(",", "."));
  const percentValid =
    percent.trim() !== "" &&
    Number.isFinite(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 100 &&
    // At most ONE decimal place. Compared after scaling rather than on the
    // string, because 22.5 is not exactly representable in binary.
    Math.abs(parsedPercent * 10 - Math.round(parsedPercent * 10)) < 1e-9;

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-4 px-1 pb-2">
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 20, letterSpacing: -0.3 }}
        >
          {scope ? scope.classTypeName : trainerName}
        </Text>
        {scope && (
          <Text className="-mt-3 text-sm" style={{ color: tokens.muted }}>
            {trainerName}
          </Text>
        )}

        <View>
          <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">
            {t("payroll.percent")}
          </CapsLabel>
          <Input
            value={percent}
            onChangeText={setPercent}
            keyboardType="decimal-pad"
            placeholder="40"
            testID="procenti-percent-input"
          />
        </View>

        <View>
          <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">
            {t("payroll.effectiveFrom")}
          </CapsLabel>
          <DateTimePicker
            mode="date"
            value={effectiveFrom}
            onChange={setEffectiveFrom}
            testID="procenti-effective-from"
          />
          <Text className="mt-1 text-xs" style={{ color: tokens.muted }}>
            {t("payroll.effectiveFromHint")}
          </Text>
        </View>

        <View>
          <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">
            {t("payroll.rateNote")}
          </CapsLabel>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder={t("payroll.rateNotePlaceholder")}
            testID="procenti-note-input"
          />
        </View>

        {history.length > 0 && (
          <View>
            <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">
              {t("payroll.rateHistory")}
            </CapsLabel>
            <View className="mt-1 gap-1">
              {history.map((rate, idx) => {
                // Several corrections on one day share a date, so the date
                // alone can't tell them apart — and only the newest is in
                // force. Dim the superseded ones and say so, otherwise the
                // list reads as three identical rows.
                const supersededSameDay =
                  idx > 0 &&
                  new Date(rate.effectiveFrom).toDateString() ===
                    new Date(history[idx - 1]!.effectiveFrom).toDateString();
                return (
                  <View
                    key={rate.id}
                    className="flex-row items-center justify-between"
                    style={{ opacity: supersededSameDay ? 0.45 : 1 }}
                  >
                    <Text className="text-sm" style={{ color: tokens.muted }}>
                      {new Date(rate.effectiveFrom).toLocaleDateString(
                        getDateLocale(),
                      )}
                      {supersededSameDay ? ` · ${t("payroll.rateSuperseded")}` : ""}
                      {rate.note ? ` · ${rate.note}` : ""}
                    </Text>
                    <Text
                      className="text-sm font-medium"
                      style={{ color: tokens.foreground }}
                    >
                      {/* A tombstone has no percentage — it is the END of an
                          override, and reading it as "null%" would be worse
                          than naming what it did. */}
                      {rate.percent === null
                        ? t("payroll.revertedToBase")
                        : formatPercent(rate.percent)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {createRate.error && (
          <Text className="text-sm" style={{ color: tokens.danger }}>
            {formatMutationError(
              createRate.error,
              t,
              i18n.language === "en" ? "en" : "sr",
              t("payroll.saveRate"),
            )}
          </Text>
        )}

        <Button
          disabled={!percentValid || createRate.isPending}
          testID="procenti-save"
          onPress={async () => {
            if (!percentValid) return;
            await createRate.mutateAsync({
              trainerUserId,
              percent: parsedPercent,
              ...(classTypeId ? { classTypeId } : {}),
              // The CALENDAR date the admin picked, formatted locally — not
              // via toISOString(), which converts to UTC first and would send
              // the previous day for anything picked before 02:00 in
              // Belgrade, starting the rate in the wrong month. The server
              // re-stamps it at the studio day boundary.
              effectiveFrom: dayjs(effectiveFrom).format("YYYY-MM-DD"),
              note: note.trim() || undefined,
            });
            onOpenChange(false);
          }}
        >
          {t("payroll.saveRate")}
        </Button>

        {/* Quieter than the save button and below it, because setting the
            percentage is what the sheet is for and ending the override is the
            exception. A sibling of the button, never nested inside it —
            nesting one press target in another is invalid on web and the
            outer one swallows the tap. */}
        {canRevert && scope && onRevert && (
          <Pressable
            accessibilityRole="button"
            testID={`procenti-revert-${scope.classTypeId}`}
            onPress={onRevert}
            android_ripple={null}
            className="active:opacity-70"
          >
            <View className="items-center py-1">
              <Text className="text-sm" style={{ color: tokens.muted }}>
                {t("payroll.revertToBase")}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </AppSheet>
  );
}

/**
 * Ending a class type's override.
 *
 * Deliberately NOT a delete: the history is what settled months were paid
 * from, so the end of an override is another dated row — a tombstone the
 * selection logic reads as "hand this class type back to the base rate from
 * here". The date is therefore a real decision, not a formality, and the
 * confirm step asks for it.
 */
export function RevertRateSheet({
  open,
  onOpenChange,
  trainerUserId,
  classTypeId,
  classTypeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainerUserId: string;
  classTypeId: string;
  classTypeName: string;
}) {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();
  const createRate = useMutation(createTrainerRateMutationOptions(queryClient));
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(() => now());

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="gap-4 px-1 pb-2">
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 20, letterSpacing: -0.3 }}
        >
          {t("payroll.revertToBase")}
        </Text>
        <Text className="-mt-2 text-sm" style={{ color: tokens.muted }}>
          {t("payroll.revertToBaseHint", { classType: classTypeName })}
        </Text>

        <View>
          <CapsLabel size={11} tracking={2.4} className="text-muted mb-1.5">
            {t("payroll.effectiveFrom")}
          </CapsLabel>
          <DateTimePicker
            mode="date"
            value={effectiveFrom}
            onChange={setEffectiveFrom}
            testID="procenti-revert-effective-from"
          />
          <Text className="mt-1 text-xs" style={{ color: tokens.muted }}>
            {t("payroll.effectiveFromHint")}
          </Text>
        </View>

        {createRate.error && (
          <Text className="text-sm" style={{ color: tokens.danger }}>
            {formatMutationError(
              createRate.error,
              t,
              i18n.language === "en" ? "en" : "sr",
              t("payroll.revertToBase"),
            )}
          </Text>
        )}

        <Button
          disabled={createRate.isPending}
          testID="procenti-revert-confirm"
          onPress={async () => {
            await createRate.mutateAsync({
              trainerUserId,
              percent: null,
              classTypeId,
              effectiveFrom: dayjs(effectiveFrom).format("YYYY-MM-DD"),
            });
            onOpenChange(false);
          }}
        >
          {t("payroll.revertToBase")}
        </Button>
      </View>
    </AppSheet>
  );
}
