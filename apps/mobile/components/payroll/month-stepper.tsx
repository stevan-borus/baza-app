import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/i18n";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  formatMonthLabel,
  isFutureMonth,
  stepMonth,
  type PayrollMonthCursor,
} from "@/lib/payroll-month-nav";

/**
 * Month picker for the payroll screens. A payroll period is always a whole
 * calendar month, so this steps one month at a time rather than reusing the
 * reports period pill (day/week/month/custom ranges have no meaning here).
 * Stepping into the future is blocked — there is nothing to pay yet.
 */
export function MonthStepper({
  cursor,
  onChange,
  testID = "payroll-month-stepper",
}: {
  cursor: PayrollMonthCursor;
  onChange: (next: PayrollMonthCursor) => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const nextDisabled = isFutureMonth(stepMonth(cursor, 1));

  return (
    <View
      // Same shell as SegmentedControl (the reports period pill): glass fill,
      // hairline border, rounded-2xl, p-1. The two sit in the same position on
      // sibling screens, so a different surface read as a different kind of
      // control.
      className="flex-row items-center justify-between rounded-2xl p-1 border bg-glass border-glass-border"
      testID={testID}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("payroll.a11yPrevMonth")}
        onPress={() => onChange(stepMonth(cursor, -1))}
        className="py-2 px-3 items-center justify-center rounded-xl"
        testID={`${testID}-prev`}
      >
        <Icon name="chevron-left" size={20} color={tokens.foreground} />
      </Pressable>

      <Text
        // Matches the pill's segment label: same size, same weight, same
        // family. `font-semibold` here was the system face, not the app's.
        className="text-sm font-body-semibold"
        style={{ color: tokens.foreground }}
        testID={`${testID}-label`}
      >
        {formatMonthLabel(cursor, getDateLocale())}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("payroll.a11yNextMonth")}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={() => onChange(stepMonth(cursor, 1))}
        className="py-2 px-3 items-center justify-center rounded-xl"
        style={{ opacity: nextDisabled ? 0.3 : 1 }}
        testID={`${testID}-next`}
      >
        <Icon name="chevron-right" size={20} color={tokens.foreground} />
      </Pressable>
    </View>
  );
}
