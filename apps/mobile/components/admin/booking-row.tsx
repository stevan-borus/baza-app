// Shared row for client bookings (upcoming + past). The upcoming section on
// the detail page and the istorija sub-route both render through this so we
// keep one source of truth for the row layout. `showCanceledTag` is the only
// behavioural difference: the upcoming list never shows it; istorija does
// (past bookings can be either completed or canceled, and only the canceled
// case needs a visual marker — completed past trainings render plain).

import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

export function BookingRow({
  booking,
  showCanceledTag = false,
}: {
  booking: ClientBooking;
  showCanceledTag?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const canceled = booking.status === "CANCELED";

  return (
    <View
      testID={`booking-row-${booking.id}`}
      className="flex-row items-start gap-3 px-4 py-3"
    >
      <View className="flex-1 flex-col gap-0.5">
        <Text
          className="text-foreground font-body-semibold"
          style={{ fontSize: 14 }}
          numberOfLines={1}
        >
          {booking.session.classType.name}
        </Text>
        <Text className="text-muted" style={{ fontSize: 12 }}>
          {`${dayjs(booking.session.startsAt).locale(lang).format("ddd, D.M.")} · ${dayjs(booking.session.startsAt).format("HH:mm")}–${dayjs(booking.session.endsAt).format("HH:mm")}`}
        </Text>
        <Text className="text-muted" style={{ fontSize: 12 }}>
          {[booking.session.room?.name, booking.session.trainer?.fullName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {showCanceledTag && canceled ? (
        <Badge status="danger">{t("admin.clientDetail.canceledTag")}</Badge>
      ) : null}
    </View>
  );
}
