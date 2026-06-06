/**
 * Bottom sheet listing the clients in a campaign's audience.
 *
 * Used in two places: compose ("view clients" — the projected audience for the
 * spec being built) and the campaign detail screen (actual recipients for a
 * SENT campaign, projected for a draft/scheduled one). The caller passes the
 * already-fetched query result so this stays a pure presentation component.
 *
 * Mounted with `rawContent` + a fixed `snapPoints` so the BottomSheetFlatList
 * sizes and scrolls in the sheet's own gesture context — a plain ScrollView
 * with a maxHeight nested in the default AppSheet wrapper breaks gorhom's
 * scroll handling.
 */
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
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
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      rawContent
      snapPoints={["80%"]}
      stackBehavior="push"
    >
      <View style={{ flex: 1 }}>
        {/* Pinned header above the flexed list. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {title}
          </Text>
        </View>

        {isError ? (
          <View style={{ paddingHorizontal: 24 }}>
            <ErrorState message={t("campaigns.clients.error")} />
          </View>
        ) : isLoading || clients === undefined ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          <BottomSheetFlatList
            data={clients}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 14 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState title={t("campaigns.clients.empty")} />}
            renderItem={({ item }) => (
              <View
                testID={`campaign-client-${item.id}`}
                className="flex-row items-center justify-between gap-3"
              >
                <View className="flex-1">
                  <Text
                    className="text-foreground font-body-medium"
                    style={{ fontSize: 15 }}
                    numberOfLines={1}
                  >
                    {item.fullName}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 12 }} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                {/* Opted-out clients are counted in reach but won't be messaged
                    — call that out so the gap is legible. */}
                {item.campaignsEnabled ? null : (
                  <Text className="text-faint" style={{ fontSize: 11 }}>
                    {t("campaigns.clients.optedOut")}
                  </Text>
                )}
              </View>
            )}
          />
        )}
      </View>
    </AppSheet>
  );
}
