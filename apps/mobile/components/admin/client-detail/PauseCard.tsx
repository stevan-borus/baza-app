// PauseCard — the pause block at the top of the client-detail Pregled tab.
//
// A pause used to be a "Pauziran" chip in the header with a bare text link
// under it. That answered "is this client paused?" and nothing else: not which
// window, not why, and not at all for a pause booked for next month, which
// leaves packageStatus unpaused (correctly — the client trains today) and so
// had no surface anywhere in the app. The card carries the window, the reason
// the admin typed, and both writes that act on it.
//
// The end action's consequence differs by kind — see end-pause-sheet — so the
// kind is passed straight through rather than re-derived from the dates here.

import { useTranslation } from "react-i18next";
import { Text, View, Pressable } from "react-native";
import dayjs from "dayjs";

import { SectionLabel } from "@/components/ui/typography";
import { EndPauseAction } from "@/components/admin/client-flows/end-pause-sheet";

export type ClientPause = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export function PauseCard({
  pause,
  kind,
  lang,
  onEditPause,
}: {
  pause: ClientPause;
  kind: "active" | "upcoming";
  lang: "sr" | "en";
  onEditPause: (pause: ClientPause, kind: "active" | "upcoming") => void;
}) {
  const { t } = useTranslation();
  const reason = pause.reason?.trim();

  return (
    <View className="gap-2">
      <SectionLabel>
        {t(
          kind === "active"
            ? "admin.clientDetail.pauseSection"
            : "admin.clientDetail.upcomingPauseSection",
        )}
      </SectionLabel>
      <View className="bg-surface rounded-lg p-4 gap-1">
        <Text
          testID="client-pause-range"
          className="text-foreground font-body-semibold"
          style={{ fontSize: 15 }}
        >
          {`${dayjs(pause.startsAt).locale(lang).format("D.M.YYYY.")} – ${dayjs(
            pause.endsAt,
          )
            .locale(lang)
            .format("D.M.YYYY.")}`}
        </Text>
        {reason ? (
          <Text
            testID="client-pause-reason"
            className="text-muted"
            style={{ fontSize: 13 }}
          >
            {t("admin.clientDetail.pauseReasonLabel", { reason })}
          </Text>
        ) : null}
        <View className="flex-row items-center justify-end gap-4 pt-1">
          <Pressable
            testID="client-edit-pause-button"
            onPress={() => onEditPause(pause, kind)}
            hitSlop={8}
            android_ripple={null}
            className="active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={t("admin.clientDetail.editPauseAction")}
          >
            <Text
              className="text-accent font-body-semibold"
              style={{ fontSize: 13 }}
            >
              {t("admin.clientDetail.editPauseAction")}
            </Text>
          </Pressable>
          <EndPauseAction pause={pause} kind={kind} />
        </View>
      </View>
    </View>
  );
}
