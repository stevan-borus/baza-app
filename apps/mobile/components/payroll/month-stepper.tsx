import { useTranslation } from "react-i18next";
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
  const { i18n, t } = useTranslation();
  const tokens = useThemeTokens();
  const nextDisabled = isFutureMonth(stepMonth(cursor, 1));

  return (
    <View
      className="flex-row items-center justify-between rounded-2xl px-2 py-2"
      style={{ backgroundColor: tokens.surface2 }}
      testID={testID}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("payroll.a11yPrevMonth")}
        onPress={() => onChange(stepMonth(cursor, -1))}
        className="h-10 w-10 items-center justify-center rounded-xl"
        testID={`${testID}-prev`}
      >
        <Icon name="chevron-left" size={20} color={tokens.foreground} />
      </Pressable>

      <Text
        className="text-base font-semibold"
        style={{ color: tokens.foreground }}
        testID={`${testID}-label`}
      >
        {formatMonthLabel(cursor, i18n.language)}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("payroll.a11yNextMonth")}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={() => onChange(stepMonth(cursor, 1))}
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ opacity: nextDisabled ? 0.3 : 1 }}
        testID={`${testID}-next`}
      >
        <Icon name="chevron-right" size={20} color={tokens.foreground} />
      </Pressable>
    </View>
  );
}
