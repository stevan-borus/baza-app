import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { PayrollBucket } from "@baza/types/payroll";
import { CapsLabel } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import { formatRsd } from "@/lib/format";

/**
 * The month's payout, split by the rate that produced it.
 *
 * A trainer no longer has ONE percentage: the class types they hold an
 * override on are paid at their own rate, and everything else falls into the
 * default bucket. A single "Procenat: 40%" line would have been a lie the
 * moment the first override existed — so the card shows the arithmetic
 * instead, per bucket, and the rows add up to the payout above them exactly
 * (the server rounds each bucket, not the total).
 *
 * Rendered on both Honorari (admin) and Zarada (the trainer's own): a payout a
 * trainer cannot check is a figure they have to take on trust.
 */
export function RateBreakdown({
  buckets,
  testIDPrefix = "payroll",
}: {
  buckets: PayrollBucket[];
  testIDPrefix?: string;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();

  if (buckets.length === 0) return null;

  return (
    <View testID={`${testIDPrefix}-breakdown`}>
      <CapsLabel>{t("payroll.breakdownTitle")}</CapsLabel>
      <View className="mt-2 gap-2">
        {buckets.map((bucket) => (
          <View
            key={bucket.classTypeId ?? "default"}
            testID={`payroll-bucket-${bucket.classTypeId ?? "default"}`}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text
                className="text-sm"
                style={{ color: tokens.foreground }}
                numberOfLines={1}
              >
                {bucket.classTypeName ?? t("payroll.defaultBucket")}
              </Text>
              <Text
                className="mt-0.5 text-xs"
                style={{
                  color: bucket.percent === null ? tokens.warning : tokens.muted,
                }}
              >
                {bucket.percent === null
                  ? t("payroll.noRate")
                  : `${formatRsd(bucket.gross)} · ${bucket.percent}%`}
              </Text>
            </View>
            <Text
              className="text-sm font-medium"
              style={{ color: tokens.foreground }}
            >
              {formatRsd(bucket.payout)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
