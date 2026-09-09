import { useTranslation } from "react-i18next";
import { Linking, Pressable, Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ErrorState } from "@/components/ui/states";
import { formatDateOfBirth, parseDateOfBirth } from "@/lib/date-of-birth";
import { formatTime } from "@/lib/format-date";
import { nowMs } from "@/lib/now";
import { useUnlockUserMutation } from "@/lib/queries/admin-users-queries-factory";
import { InitialsAvatar } from "@/components/admin/client-detail/InitialsAvatar";
import { PackageStatusPill } from "@/components/admin/client-detail/PackageStatusPill";

type HeaderClient = {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    /** Sign-in lock, independent of `isActive`. Optional so a payload cached
     *  before the field shipped still renders — it just shows no lock. */
    lockedUntil?: string | null;
  };
  dateOfBirth: string | null;
  packageStatus: "active" | "expiring" | "paused" | "expired" | "none";
};

export function ClientDetailHeaderCard({
  client,
  onPressPhone,
}: {
  client: HeaderClient;
  onPressPhone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "sr" ? "sr" : "en";
  const unlock = useUnlockUserMutation();

  // Only a lock still ahead of us is a lock. The server already filters
  // expired ones out, but a cached payload can outlive the deadline, and a
  // padlock the admin cannot explain (sign-in already lets the client
  // through) is worse than showing nothing.
  const lockedUntil = client.user.lockedUntil;
  const isLocked = lockedUntil != null && Date.parse(lockedUntil) > nowMs();

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
          {isLocked ? (
            <View className="flex-row items-center gap-2 mt-1">
              <Badge status="warning">
                <Text testID="client-detail-locked-badge">
                  {t("admin.clientDetail.lockedUntil", {
                    time: formatTime(lockedUntil, lang),
                  })}
                </Text>
              </Badge>
              <Button
                testID="client-detail-unlock-button"
                variant="secondary"
                size="small"
                disabled={unlock.isPending}
                accessibilityLabel={t("admin.clientDetail.unlockA11y")}
                onPress={() => unlock.mutate({ id: client.user.id })}
              >
                {t("admin.clientDetail.unlock")}
              </Button>
            </View>
          ) : null}
          {unlock.isError ? (
            <ErrorState
              message={t("admin.clientDetail.unlockError")}
              testID="client-detail-unlock-error"
            />
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
        <PackageStatusPill status={client.packageStatus} />
      </View>
    </GlassCard>
  );
}
