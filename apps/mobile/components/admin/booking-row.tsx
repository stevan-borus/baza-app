// Shared row for client bookings (upcoming + past). The upcoming section on
// the detail page and the istorija sub-route both render through this so we
// keep one source of truth for the row layout. `showCanceledTag` is the only
// behavioural difference: the upcoming list never shows it; istorija does
// (past bookings can be either completed or canceled, and only the canceled
// case needs a visual marker — completed past trainings render plain).

import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { AdvancedBadge } from "@/components/ui/advanced-badge";
import { useThemeTokens } from "@/components/ui/tokens";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

export function BookingRow({
  booking,
  showCanceledTag = false,
  onPress,
  accessibilityLabel,
}: {
  booking: ClientBooking;
  showCanceledTag?: boolean;
  /**
   * When set the whole row becomes pressable (used by the upcoming-sessions
   * screen to open the cancel flow). History rows leave it undefined so they
   * stay static — same layout, no touch affordance.
   */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const tokens = useThemeTokens();
  const lang = i18n.language === "en" ? "en" : "sr";
  const canceled = booking.status === "CANCELED";

  const inner = (
    <>
      <View className="flex-1 flex-col gap-0.5">
        <Text
          className="text-foreground font-body-semibold"
          style={{ fontSize: 14 }}
          numberOfLines={1}
        >
          {booking.session.classType.name}
        </Text>
        {/* Date·time meta — the 🔥 mark rides at the end (time never truncates). */}
        <View className="flex-row items-center gap-1.5">
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {`${dayjs(booking.session.startsAt).locale(lang).format("ddd, D.M.")} · ${dayjs(booking.session.startsAt).format("HH:mm")}–${dayjs(booking.session.endsAt).format("HH:mm")}`}
          </Text>
          <AdvancedBadge isAdvanced={booking.session.isAdvanced} />
        </View>
        <Text className="text-muted" style={{ fontSize: 12 }}>
          {[booking.session.room?.name, booking.session.trainer?.fullName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {showCanceledTag && canceled ? (
        <Badge status="danger">{t("admin.clientDetail.canceledTag")}</Badge>
      ) : null}
      {onPress ? (
        <View className="self-center">
          <Icon name="chevron-right" size={16} color={tokens.faint} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={`booking-row-${booking.id}`}
        onPress={onPress}
        android_ripple={null}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="flex-row items-start gap-3 px-4 py-3 active:opacity-60"
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View
      testID={`booking-row-${booking.id}`}
      className="flex-row items-start gap-3 px-4 py-3"
    >
      {inner}
    </View>
  );
}
