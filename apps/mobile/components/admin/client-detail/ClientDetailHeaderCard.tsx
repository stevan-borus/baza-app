import { useTranslation } from "react-i18next";
import { Linking, Pressable, Text, View } from "react-native";
import { GlassCard } from "@/components/ui/glass-card";
import { formatDateOfBirth, parseDateOfBirth } from "@/lib/date-of-birth";
import { InitialsAvatar } from "@/components/admin/client-detail/InitialsAvatar";
import { PackageStatusPill } from "@/components/admin/client-detail/PackageStatusPill";
import {
  EndPauseAction,
  type ActivePause,
} from "@/components/admin/client-flows/end-pause-sheet";

type HeaderClient = {
  user: { fullName: string; email: string; phone: string | null };
  dateOfBirth: string | null;
  packageStatus: "active" | "expiring" | "paused" | "expired" | "none";
  /** The running PackagePause, or null. Optional so a payload cached before
   *  the field shipped still renders — it just offers no end-pause action. */
  activePause?: ActivePause | null;
};

export function ClientDetailHeaderCard({
  client,
  onPressPhone,
}: {
  client: HeaderClient;
  onPressPhone: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <GlassCard size="md">
      <View className="flex-row items-center gap-3">
        <InitialsAvatar name={client.user.fullName} />
        <View className="flex-1 gap-0.5">
          <Text
            testID="client-detail-name"
            className="text-foreground font-body-bold"
            style={{ fontSize: 17, letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {client.user.fullName}
          </Text>
          <Pressable
            testID="client-detail-email"
            onPress={() =>
              void Linking.openURL(`mailto:${client.user.email}`).catch(() => {})
            }
            accessibilityRole="link"
          >
            <Text
              className="text-accent"
              style={{ fontSize: 13 }}
              numberOfLines={1}
            >
              {client.user.email}
            </Text>
          </Pressable>
          {client.user.phone ? (
            <Pressable
              testID="client-detail-phone"
              onPress={onPressPhone}
              accessibilityRole="button"
            >
              <Text
                className="text-accent"
                style={{ fontSize: 13 }}
                numberOfLines={1}
              >
                {client.user.phone}
              </Text>
            </Pressable>
          ) : null}
          {client.dateOfBirth ? (
            <View className="flex-row items-center gap-2">
              <Text className="text-muted" style={{ fontSize: 13 }}>
                {t("admin.clients.labelDateOfBirth")}:
              </Text>
              <Text className="text-foreground" style={{ fontSize: 13 }}>
                {formatDateOfBirth(
                  parseDateOfBirth(client.dateOfBirth),
                  i18n.language === "sr" ? "sr" : "en",
                )}
              </Text>
            </View>
          ) : null}
        </View>
        {/* The pill says "Pauziran"; the action right under it is how the
            admin undoes that, so the two sit in one column. */}
        <View className="items-end gap-1.5">
          <PackageStatusPill status={client.packageStatus} />
          {client.packageStatus === "paused" && client.activePause ? (
            <EndPauseAction pause={client.activePause} />
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
}
