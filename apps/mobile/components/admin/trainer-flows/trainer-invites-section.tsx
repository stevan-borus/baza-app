// The trainer half of the invites list. It reads the SAME `invitesQueries.list()`
// cache the Klijenti invites tab reads and narrows it to role === "TRAINER" —
// so a resend/revoke here splices through to both surfaces without a refetch,
// and neither screen ever shows the other's people.
//
// Row layout, status badge, and the confirm-before-revoke interaction
// deliberately mirror the Klijenti invite rows: an admin who has revoked a
// client invite already knows how to revoke a trainer one. The status copy is
// role-neutral, so it reuses admin.clients.inviteStatus* rather than cloning it.

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { GlassCard } from "@/components/ui/glass-card";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useThemeTokens } from "@/components/ui/tokens";
import { SectionLabel } from "@/components/ui/typography";
import {
  invitesQueries,
  resendInviteMutationOptions,
  revokeInviteMutationOptions,
  type Invite,
} from "@/lib/queries/invites-queries-factory";

const inviteStatusKeys: Record<string, string> = {
  PENDING: "admin.clients.inviteStatusPending",
  COMPLETED: "admin.clients.inviteStatusCompleted",
  REVOKED: "admin.clients.inviteStatusRevoked",
  EXPIRED: "admin.clients.inviteStatusExpired",
};

export function TrainerInvitesSection() {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const queryClient = useQueryClient();

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const invitesQuery = useQuery(invitesQueries.list());
  const revokeMutation = useMutation(revokeInviteMutationOptions(queryClient));
  const resendMutation = useMutation(resendInviteMutationOptions(queryClient));

  const invites = (invitesQuery.data?.invites ?? []).filter(
    (invite) => invite.role === "TRAINER",
  );

  return (
    <View className="gap-3">
      <SectionLabel>{t("admin.trainers.invitesTitle")}</SectionLabel>

      {/* A failed load must say so rather than read as "no invites" — same
          copy the Klijenti invites tab shows, since it is the same query. */}
      {invitesQuery.isError ? (
        <ErrorState message={t("admin.clients.invitesError")} />
      ) : null}

      {/* "No invites yet" is only true once we know — while the query is in
          flight it would be a lie the admin has to watch flip. */}
      {invitesQuery.isSuccess && invites.length === 0 ? (
        <EmptyState title={t("admin.trainers.invitesEmpty")} />
      ) : null}

      {invites.map((invite: Invite) => (
        <GlassCard key={invite.id} testID={`trainer-invite-row-${invite.id}`}>
          <View className="flex-col gap-2.5">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-col">
                <Text
                  className="text-foreground font-body-semibold"
                  style={{ fontSize: 15 }}
                >
                  {invite.fullName}
                </Text>
                <Text className="text-muted" style={{ fontSize: 13 }}>
                  {invite.email}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {/* The agreed cut, visible while the invite is still pending —
                    the admin should not have to wait for redemption to see
                    what they promised. */}
                {invite.trainerPercent != null ? (
                  <Text
                    className="text-muted"
                    style={{ fontSize: 13 }}
                    testID={`trainer-invite-percent-${invite.id}`}
                  >
                    {`${invite.trainerPercent}%`}
                  </Text>
                ) : null}
                <Badge
                  status={
                    invite.status === "COMPLETED"
                      ? "success"
                      : invite.status === "PENDING"
                        ? "warning"
                        : "danger"
                  }
                >
                  {inviteStatusKeys[invite.status]
                    ? t(inviteStatusKeys[invite.status])
                    : invite.status}
                </Badge>
              </View>
            </View>
            {invite.status === "PENDING" ? (
              <View className="flex-row gap-2">
                <Pressable
                  testID={`trainer-invite-resend-${invite.id}`}
                  onPress={() => resendMutation.mutate(invite.id)}
                  disabled={resendMutation.isPending}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-glass-border bg-glass active:opacity-70"
                >
                  <Icon name="refresh" size={12} color={tokens.muted} />
                  <Text
                    className="text-foreground"
                    style={{ fontSize: 12, fontWeight: "600" }}
                  >
                    {t("admin.clients.resend")}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`trainer-invite-revoke-${invite.id}`}
                  onPress={() => setConfirmRevokeId(invite.id)}
                  disabled={revokeMutation.isPending}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-danger-soft bg-danger-soft active:opacity-70"
                >
                  <Icon name="ban" size={12} color={tokens.danger} />
                  <Text
                    className="text-danger"
                    style={{ fontSize: 12, fontWeight: "600" }}
                  >
                    {t("admin.clients.revoke")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </GlassCard>
      ))}

      <ConfirmSheet
        open={!!confirmRevokeId}
        onOpenChange={(o) => !o && setConfirmRevokeId(null)}
        title={t("confirm.revokeInviteTitle")}
        message={t("confirm.revokeInviteMessage")}
        confirmLabel={t("confirm.revokeInviteConfirm")}
        loading={revokeMutation.isPending}
        errorMessage={
          revokeMutation.isError
            ? ((revokeMutation.error as Error)?.message ?? null)
            : null
        }
        onConfirm={() => {
          if (!confirmRevokeId) return;
          revokeMutation.mutate(confirmRevokeId, {
            onSuccess: () => setConfirmRevokeId(null),
          });
        }}
      />
    </View>
  );
}
