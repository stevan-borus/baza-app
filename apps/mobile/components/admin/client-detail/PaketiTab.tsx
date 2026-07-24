import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { SkeletonCard } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/typography";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  useAddSessionToClientPackageMutation,
  useRevokeClientPackageMutation,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import { nowMs } from "@/lib/now";
import { formatClassTypeList } from "@/lib/format";

export function PaketiTab({
  packagesQuery,
  allPackages,
  lang,
  bottomPad,
}: {
  packagesQuery: ReturnType<typeof useQuery>;
  allPackages: ClientPackage[];
  lang: "sr" | "en";
  bottomPad: number;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  // Keep-the-trace revoke: destructive confirm first, then the server
  // cancels future bookings, releases unbacked waitlist seats and voids the
  // linked payment in one transaction. Cache upkeep lives in the factory.
  const [revokeTarget, setRevokeTarget] = useState<ClientPackage | null>(null);
  const revokeMutation = useRevokeClientPackageMutation();
  // "+1 termin": restore the session a no-show charge took after a justified
  // absence. Only offered on an active package (an expired/revoked one can't
  // absorb a useful credit) — same active gate the server enforces.
  const [addSessionTarget, setAddSessionTarget] = useState<ClientPackage | null>(
    null,
  );
  const addSessionMutation = useAddSessionToClientPackageMutation();
  return (
    <ScrollView
      testID="client-detail-tab-content-paketi"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: bottomPad,
        gap: 8,
      }}
    >
      <SectionLabel>{t("admin.clientDetail.packageHistory")}</SectionLabel>
      {packagesQuery.isLoading ? (
        <SkeletonCard />
      ) : packagesQuery.isError ? (
        <ErrorState message={t("admin.clientDetail.packagesError")} />
      ) : allPackages.length === 0 ? (
        <EmptyState title={t("admin.clientDetail.noPackages")} />
      ) : (
        <View className="bg-surface rounded-lg overflow-hidden">
          {allPackages.map((p, idx) => {
            const revoked = !!p.revokedAt;
            const expired = new Date(p.expiresAt).getTime() < nowMs();
            const usedUp = p.sessionsRemaining <= 0;
            const billingStatus = p.billingRecord?.status ?? "CONFIRMED";
            return (
              <React.Fragment key={p.id}>
                {idx > 0 ? (
                  <View
                    className="bg-glass-border"
                    style={{ height: 1, marginLeft: 16 }}
                  />
                ) : null}
                <View
                  testID={`package-history-row-${p.id}`}
                  className="flex-col gap-1 px-4 py-3"
                  style={revoked ? { opacity: 0.6 } : undefined}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <Text
                      className="text-foreground font-body-semibold flex-1"
                      style={{ fontSize: 14 }}
                      numberOfLines={1}
                    >
                      {p.packageType?.name ?? "—"}
                    </Text>
                    {revoked ? (
                      <Badge status="neutral">
                        {t("admin.clientDetail.status.revoked")}
                      </Badge>
                    ) : expired ? (
                      <Badge status="danger">
                        {t("admin.clientDetail.status.expired")}
                      </Badge>
                    ) : usedUp ? (
                      <Badge status="neutral">
                        {t("admin.clientDetail.status.usedUp")}
                      </Badge>
                    ) : (
                      <Badge status="success">
                        {t("admin.clientDetail.status.active")}
                      </Badge>
                    )}
                    {!revoked && !expired ? (
                      <Pressable
                        testID={`package-history-row-${p.id}-add-session`}
                        onPress={() => setAddSessionTarget(p)}
                        hitSlop={8}
                        android_ripple={null}
                        className="active:opacity-60"
                        accessibilityRole="button"
                        accessibilityLabel={t("admin.clientDetail.addSessionAction")}
                      >
                        <Text
                          className="text-success font-body-semibold"
                          style={{ fontSize: 13 }}
                        >
                          {t("admin.clientDetail.addSessionAction")}
                        </Text>
                      </Pressable>
                    ) : null}
                    {!revoked ? (
                      <Pressable
                        testID={`package-history-row-${p.id}-revoke`}
                        onPress={() => setRevokeTarget(p)}
                        hitSlop={8}
                        android_ripple={null}
                        className="active:opacity-60"
                        accessibilityRole="button"
                        accessibilityLabel={t("admin.clientDetail.revokeAction")}
                      >
                        <Icon name="ban" size={16} color={tokens.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  {(p.classTypes ?? []).length > 0 ? (
                    <Text
                      testID={`package-history-row-${p.id}-covered`}
                      className="text-muted"
                      style={{ fontSize: 12 }}
                      numberOfLines={1}
                    >
                      {formatClassTypeList((p.classTypes ?? []).map((ct) => ct.name))}
                    </Text>
                  ) : null}
                  <Text className="text-muted" style={{ fontSize: 12 }}>
                    {`${dayjs(p.startsAt).locale(lang).format("D.M.YYYY.")} — ${dayjs(p.expiresAt).locale(lang).format("D.M.YYYY.")}`}
                  </Text>
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-muted" style={{ fontSize: 12 }}>
                      {t("admin.clientDetail.sessionsRemaining", {
                        remaining: p.sessionsRemaining,
                        // Grant-aware total (server: sessionCount + bonusSessions),
                        // so a "+1 termin" grant reads 13/13, not 13/12.
                        total: p.sessionsTotal ?? "—",
                      })}
                    </Text>
                    <Text
                      testID={`package-history-row-${p.id}-billing-tag`}
                      className={
                        p.billingRecord && billingStatus === "PENDING"
                          ? "text-warning font-body-medium"
                          : "text-muted font-body-medium"
                      }
                      style={{ fontSize: 12 }}
                    >
                      {p.billingRecord
                        ? billingStatus === "PENDING"
                          ? t("admin.clientDetail.notPaid")
                          : billingStatus === "VOIDED"
                            ? t("admin.clientDetail.voided")
                            : t("admin.clientDetail.paid", {
                                amount: p.billingRecord.amount,
                              })
                        : t("admin.clientDetail.comp")}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}
      <ConfirmSheet
        testID="package-revoke-confirm-button"
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title={t("confirm.revokePackageTitle")}
        message={t("confirm.revokePackageMessage")}
        confirmLabel={t("confirm.revokePackageConfirm")}
        loading={revokeMutation.isPending}
        errorMessage={
          revokeMutation.isError ? t("admin.clientDetail.revokeError") : null
        }
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeMutation.mutate(revokeTarget.id, {
            onSuccess: () => setRevokeTarget(null),
          });
        }}
      />
      <ConfirmSheet
        testID="package-add-session-confirm-button"
        open={!!addSessionTarget}
        onOpenChange={(open) => {
          if (!open) setAddSessionTarget(null);
        }}
        tone="primary"
        title={t("confirm.addSessionTitle")}
        message={t("confirm.addSessionMessage")}
        confirmLabel={t("confirm.addSessionConfirm")}
        loading={addSessionMutation.isPending}
        errorMessage={
          addSessionMutation.isError
            ? t("admin.clientDetail.addSessionError")
            : null
        }
        onConfirm={() => {
          if (!addSessionTarget) return;
          addSessionMutation.mutate(addSessionTarget.id, {
            onSuccess: () => setAddSessionTarget(null),
          });
        }}
      />
    </ScrollView>
  );
}
