/**
 * Bottom sheet listing the clients in a campaign's audience.
 *
 * Used in two places: compose ("view clients" — the projected audience for the
 * spec being built) and the campaign detail screen (actual recipients for a
 * SENT campaign, projected for a draft/scheduled one). The caller passes the
 * already-fetched query result so this stays a pure presentation component.
 */
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AppSheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { AudienceClient } from "@/lib/queries/campaigns-queries-factory";

export function CampaignClientListSheet({
  open,
  onOpenChange,
  title,
  clients,
  isLoading,
  isError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  clients: AudienceClient[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation();

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      <View className="flex-col gap-4">
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 20, letterSpacing: -0.3 }}
        >
          {title}
        </Text>

        {isError ? (
          <ErrorState message={t("campaigns.clients.error")} />
        ) : isLoading || clients === undefined ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator />
          </View>
        ) : clients.length === 0 ? (
          <EmptyState title={t("campaigns.clients.empty")} />
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <View className="gap-3">
              {clients.map((c) => (
                <View
                  key={c.id}
                  testID={`campaign-client-${c.id}`}
                  className="flex-row items-center justify-between gap-3"
                >
                  <View className="flex-1">
                    <Text
                      className="text-foreground font-body-medium"
                      style={{ fontSize: 15 }}
                      numberOfLines={1}
                    >
                      {c.fullName}
                    </Text>
                    <Text className="text-muted" style={{ fontSize: 12 }} numberOfLines={1}>
                      {c.email}
                    </Text>
                  </View>
                  {/* Opted-out clients are counted in reach but won't be
                      messaged — call that out so the gap is legible. */}
                  {c.campaignsEnabled ? null : (
                    <Text className="text-faint" style={{ fontSize: 11 }}>
                      {t("campaigns.clients.optedOut")}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </AppSheet>
  );
}
