/**
 * Campaigns history — admin list of every campaign (draft / scheduled / sent)
 * with a "+" affordance into the compose screen. Mirrors the sibling admin
 * list screens (Naplata / Izvestaji): ScreenContainerRaw + AdminTabLeftSlot,
 * a ScrollView body, and hairline-light GlassCard rows.
 */
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import { campaignsQueries } from "@/lib/queries/campaigns-queries-factory";

export default function CampaignsHistory() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const listQuery = useQuery(campaignsQueries.list());
  const campaigns = listQuery.data?.campaigns ?? [];

  return (
    <ScreenContainerRaw
      title={t("campaigns.title")}
      leftSlot={<AdminTabLeftSlot />}
      rightSlot={
        <Pressable
          testID="campaign-new-button"
          onPress={() => router.push("/(admin)/kampanje/compose")}
          android_ripple={null}
          hitSlop={12}
          className="w-9 h-9 items-center justify-center active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={t("campaigns.a11y.newCampaign")}
        >
          <Icon name="plus" size={20} color={tokens.foreground} />
        </Pressable>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
        }}
      >
        {listQuery.isError ? (
          <ErrorState message={t("campaigns.error")} />
        ) : campaigns.length === 0 && !listQuery.isLoading ? (
          <EmptyState title={t("campaigns.empty")} />
        ) : (
          <View className="gap-3">
            {campaigns.map((c) => (
              <GlassCard
                key={c.id}
                testID={`campaign-row-${c.id}`}
                style={{ paddingVertical: 14 }}
              >
                <View className="flex-1 gap-1">
                  <Text
                    className="text-foreground font-body-semibold"
                    style={{ fontSize: 15 }}
                    numberOfLines={1}
                  >
                    {c.title}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {t(`campaigns.status.${c.status}`)} ·{" "}
                    {t("campaigns.recipients", { count: c.recipientCount })}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
