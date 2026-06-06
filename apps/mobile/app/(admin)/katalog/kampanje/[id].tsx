/**
 * Campaign detail — the lifecycle surface for a single campaign.
 *
 * Reachable by tapping a row in the campaigns list. Shows the composed message
 * + status, and offers the actions valid for the current status:
 *   - DRAFT     → Send now, Delete
 *   - SCHEDULED → Send now, Cancel (back to draft), Delete
 *   - SENDING   → read-only (a dispatch is in flight)
 *   - SENT      → read-only (immutable)
 *
 * Send / Cancel / Delete each go through a ConfirmSheet because they message
 * the audience or destroy the campaign. Each uses the factory mutation hook
 * (invalidation baked in); on success we navigate back to the list.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { CampaignAudienceSpec } from "@baza/types";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { AppSheet } from "@/components/ui/sheet";
import { GlassCard } from "@/components/ui/glass-card";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { getDateLocale } from "@/lib/i18n";
import {
  campaignsQueries,
  useCancelCampaignMutation,
  useRemoveCampaignMutation,
  useSendCampaignMutation,
  useUpdateCampaignMutation,
} from "@/lib/queries/campaigns-queries-factory";
import {
  CampaignComposeSheetContent,
  type ComposePayload,
} from "@/components/admin/campaign-compose-sheet-content";
import { CampaignClientListSheet } from "@/components/admin/campaign-client-list-sheet";

type Action = "send" | "cancel" | "delete";

export default function CampaignDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const dateLocale = getDateLocale();
  const bottomPad = useTabBarBottomPadding(24);
  const { id } = useLocalSearchParams<{ id: string }>();

  const detailQuery = useQuery(campaignsQueries.one(id));
  const campaign = detailQuery.data?.campaign;

  const sendMutation = useSendCampaignMutation();
  const cancelMutation = useCancelCampaignMutation();
  const removeMutation = useRemoveCampaignMutation();
  const updateMutation = useUpdateCampaignMutation();

  const [pending, setPending] = useState<Action | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Recipients/audience sheet — fetched on demand (only once opened).
  const [clientsOpen, setClientsOpen] = useState(false);
  const recipientsQuery = useQuery(campaignsQueries.recipients(id, clientsOpen));

  function saveEdit(payload: ComposePayload) {
    if (!campaign) return;
    updateMutation.mutate(
      {
        id: campaign.id,
        title: payload.title,
        body: payload.body,
        audienceSpec: payload.audienceSpec,
        // Keep the campaign's current status; only re-schedule if a time was
        // (re)picked in the form.
        ...(payload.scheduledFor ? { scheduledFor: payload.scheduledFor } : {}),
      },
      { onSuccess: () => setEditOpen(false) },
    );
  }

  const activeMutation =
    pending === "send"
      ? sendMutation
      : pending === "cancel"
        ? cancelMutation
        : pending === "delete"
          ? removeMutation
          : null;

  function confirm() {
    if (!campaign || !pending) return;
    const onDone = { onSuccess: () => router.back() };
    if (pending === "send") sendMutation.mutate(campaign.id, onDone);
    else if (pending === "cancel") cancelMutation.mutate(campaign.id, onDone);
    else if (pending === "delete") removeMutation.mutate(campaign.id, onDone);
  }

  return (
    <ScreenContainerRaw title={t("campaigns.detail.title")} headerVariant="detail">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {detailQuery.isError ? (
          <ErrorState message={t("campaigns.error")} />
        ) : !campaign ? (
          <SkeletonCard />
        ) : (
          <>
            <GlassCard style={{ padding: 16, gap: 10 }}>
              <Text className="text-muted" style={{ fontSize: 12 }}>
                {t(`campaigns.status.${campaign.status}`)}
                {campaign.status === "SCHEDULED" && campaign.scheduledFor
                  ? ` · ${new Date(campaign.scheduledFor).toLocaleString(dateLocale)}`
                  : ""}
                {campaign.status === "SENT"
                  ? ` · ${t("campaigns.recipients", { count: campaign.recipientCount })}`
                  : ""}
              </Text>
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 19, letterSpacing: -0.3 }}
              >
                {campaign.title}
              </Text>
              <Text className="text-muted" style={{ fontSize: 14, lineHeight: 21 }}>
                {campaign.body}
              </Text>
              <Pressable
                testID="campaign-detail-view-clients"
                onPress={() => setClientsOpen(true)}
                android_ripple={null}
                className="active:opacity-60 self-start pt-1"
                accessibilityRole="button"
              >
                <Text className="text-accent font-body-medium" style={{ fontSize: 13 }}>
                  {campaign.status === "SENT"
                    ? t("campaigns.clients.viewRecipients", { count: campaign.recipientCount })
                    : t("campaigns.clients.viewAudience")}
                </Text>
              </Pressable>
            </GlassCard>

            {/* Actions valid for the current status. SENDING/SENT are read-only. */}
            {campaign.status === "DRAFT" || campaign.status === "SCHEDULED" ? (
              <View className="gap-3">
                <Button
                  testID="campaign-detail-edit"
                  variant="secondary"
                  onPress={() => {
                    updateMutation.reset();
                    setEditOpen(true);
                  }}
                >
                  {t("campaigns.detail.edit")}
                </Button>
                <Button testID="campaign-detail-send" onPress={() => setPending("send")}>
                  {t("campaigns.compose.sendNow")}
                </Button>
                {campaign.status === "SCHEDULED" ? (
                  <Button
                    testID="campaign-detail-cancel"
                    variant="secondary"
                    onPress={() => setPending("cancel")}
                  >
                    {t("campaigns.detail.cancelSchedule")}
                  </Button>
                ) : null}
                <Button
                  testID="campaign-detail-delete"
                  variant="danger"
                  onPress={() => setPending("delete")}
                >
                  {t("campaigns.detail.delete")}
                </Button>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmSheet
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          pending === "send"
            ? t("campaigns.compose.confirmSendTitle")
            : pending === "cancel"
              ? t("campaigns.detail.confirmCancelTitle")
              : t("campaigns.detail.confirmDeleteTitle")
        }
        message={
          pending === "send"
            ? t("campaigns.detail.confirmSendMessage")
            : undefined
        }
        confirmLabel={
          pending === "send"
            ? t("campaigns.compose.sendNow")
            : pending === "cancel"
              ? t("campaigns.detail.cancelSchedule")
              : t("campaigns.detail.delete")
        }
        tone={pending === "send" ? "primary" : "danger"}
        loading={activeMutation?.isPending ?? false}
        errorMessage={
          activeMutation?.isError ? t("campaigns.detail.actionError") : null
        }
        testID="campaign-detail-confirm"
        onConfirm={confirm}
      />

      {/* Edit — the compose sheet pre-filled; saving PATCHes the campaign and
          keeps its current status (re-schedules only if a time is re-picked). */}
      <AppSheet open={editOpen} onOpenChange={setEditOpen} stackBehavior="push">
        {campaign ? (
          <CampaignComposeSheetContent
            mode="edit"
            initial={{
              title: campaign.title,
              body: campaign.body,
              audienceSpec: campaign.audienceSpec as CampaignAudienceSpec,
              scheduledFor: campaign.scheduledFor ?? null,
            }}
            busy={updateMutation.isPending}
            errorMessage={updateMutation.isError ? t("campaigns.detail.actionError") : null}
            onSaveDraft={() => {}}
            onRequestSend={() => {}}
            onSaveEdit={saveEdit}
          />
        ) : null}
      </AppSheet>

      {/* Recipients (SENT) or projected audience (not yet sent). */}
      <CampaignClientListSheet
        open={clientsOpen}
        onOpenChange={setClientsOpen}
        title={
          campaign?.status === "SENT"
            ? t("campaigns.clients.recipientsTitle")
            : t("campaigns.clients.audienceTitle")
        }
        clients={recipientsQuery.data?.clients}
        isLoading={recipientsQuery.isLoading}
        isError={recipientsQuery.isError}
      />
    </ScreenContainerRaw>
  );
}
