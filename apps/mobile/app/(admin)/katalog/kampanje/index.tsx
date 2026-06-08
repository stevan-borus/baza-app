/**
 * Campaigns history — admin list of every campaign (draft / scheduled / sent).
 * A child page of Katalog (detail header → back to Katalog). The "+" opens the
 * compose form in a bottom sheet (the app's "add" pattern), and this screen
 * owns the create mutation + the send-confirmation sheet so the compose content
 * stays a pure form.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import type { CampaignAudienceSpec } from "@baza/types";
import {
  campaignsQueries,
  useCreateCampaignMutation,
} from "@/lib/queries/campaigns-queries-factory";
import {
  CampaignComposeSheetContent,
  type ComposePayload,
} from "@/components/admin/campaign-compose-sheet-content";
import { CampaignClientListSheet } from "@/components/admin/campaign-client-list-sheet";

export default function CampaignsHistory() {
  const { t } = useTranslation();
  const router = useRouter();
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding(24);
  const listQuery = useQuery(campaignsQueries.list());
  const campaigns = listQuery.data?.campaigns ?? [];

  const [composeOpen, setComposeOpen] = useState(false);
  // A send-now / scheduled submit waits on a confirmation sheet; saving a draft
  // does not. Holds the payload + the resolved reach for the confirm copy.
  const [pendingSend, setPendingSend] = useState<{ payload: ComposePayload; reach: number } | null>(null);
  const createMutation = useCreateCampaignMutation();

  // "View clients" — a sibling sheet that STACKS over the compose sheet (the
  // compose sheet stays mounted underneath). `viewSpec` holds the spec to list;
  // null = closed.
  const [viewSpec, setViewSpec] = useState<CampaignAudienceSpec | null>(null);
  const clientsQuery = useQuery({
    ...campaignsQueries.audienceClients(viewSpec),
    enabled: viewSpec !== null,
  });

  function reset() {
    createMutation.reset();
  }
  function submit(payload: ComposePayload) {
    createMutation.mutate(payload, {
      onSuccess: () => {
        setPendingSend(null);
        setComposeOpen(false);
      },
    });
  }

  return (
    <ScreenContainerRaw
      title={t("campaigns.title")}
      headerVariant="detail"
      rightSlot={
        <Pressable
          testID="campaign-new-button"
          onPress={() => {
            reset();
            setComposeOpen(true);
          }}
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
        ) : listQuery.isLoading ? (
          <SkeletonList count={4} />
        ) : campaigns.length === 0 ? (
          <EmptyState title={t("campaigns.empty")} />
        ) : (
          <View className="gap-3">
            {campaigns.map((c) => (
              <Pressable
                key={c.id}
                testID={`campaign-row-${c.id}`}
                onPress={() =>
                  router.push(`/(admin)/katalog/kampanje/${c.id}` as const)
                }
                android_ripple={null}
                className="active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={c.title}
              >
                <GlassCard style={{ paddingVertical: 14 }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 gap-1 pr-3">
                      <Text
                        className="text-foreground font-body-semibold"
                        style={{ fontSize: 15 }}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {t(`campaigns.status.${c.status}`)}
                        {/* recipientCount is only meaningful once SENT — it's 0
                            on DRAFT/SCHEDULED, so don't imply "0 recipients". */}
                        {c.status === "SENT"
                          ? ` · ${t("campaigns.recipients", { count: c.recipientCount })}`
                          : ""}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={tokens.faint} />
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Compose — bottom sheet (the app's "add" pattern). `push` so it stays
          visible underneath when the client-list sheet stacks over it. */}
      <AppSheet open={composeOpen} onOpenChange={setComposeOpen} stackBehavior="push">
        <CampaignComposeSheetContent
          busy={createMutation.isPending}
          errorMessage={
            createMutation.isError && pendingSend === null
              ? t("campaigns.compose.saveError")
              : null
          }
          onSaveDraft={submit}
          onRequestSend={(payload, reach) => setPendingSend({ payload, reach })}
          onViewClients={setViewSpec}
        />
      </AppSheet>

      {/* Audience clients — STACKS over the compose sheet (sibling, not nested,
          so the compose sheet stays mounted underneath and there's no flicker). */}
      <CampaignClientListSheet
        open={viewSpec !== null}
        onOpenChange={(open) => {
          if (!open) setViewSpec(null);
        }}
        title={t("campaigns.clients.audienceTitle")}
        clients={clientsQuery.data?.clients}
        isLoading={clientsQuery.isLoading}
        isError={clientsQuery.isError}
      />

      {/* Confirm before messaging the whole audience. */}
      <ConfirmSheet
        open={pendingSend !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSend(null);
        }}
        title={
          pendingSend?.payload.sendNow
            ? t("campaigns.compose.confirmSendTitle")
            : t("campaigns.compose.confirmScheduleTitle")
        }
        message={t("campaigns.compose.confirmMessage", { count: pendingSend?.reach ?? 0 })}
        confirmLabel={
          pendingSend?.payload.sendNow
            ? t("campaigns.compose.sendNow")
            : t("campaigns.compose.schedule")
        }
        tone="primary"
        loading={createMutation.isPending}
        errorMessage={createMutation.isError ? t("campaigns.compose.saveError") : null}
        testID="campaign-confirm-send"
        onConfirm={() => {
          if (pendingSend) submit(pendingSend.payload);
        }}
      />
    </ScreenContainerRaw>
  );
}
