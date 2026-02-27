import { useState } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list";
import { Text, XStack, YStack } from "tamagui";
import { getDateLocale } from "@/lib/i18n";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/typography";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  type BillingRecord,
} from "@/lib/queries/billing-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

export default function AdminBilling() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    clientUserId: "",
    amount: "",
    method: "CASH",
    notes: "",
    packageTypeId: "",
  });

  const billingQuery = useInfiniteQuery(billingQueries.listInfinite());
  const clientsQuery = useQuery(clientsQueries.list());
  const packageTypesQuery = useQuery(packagesQueries.types());
  const records = billingQuery.data?.pages.flatMap((p) => p.records) ?? [];

  const createMutation = useMutation({
    ...billingQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setShowCreate(false);
      setForm({
        clientUserId: "",
        amount: "",
        method: "CASH",
        notes: "",
        packageTypeId: "",
      });
    },
  });

  function handleEndReached() {
    if (billingQuery.hasNextPage && !billingQuery.isFetchingNextPage)
      billingQuery.fetchNextPage();
  }

  const methodLabelKeys: Record<string, string> = {
    CASH: "admin.manage.methodCash",
    CARD: "admin.manage.methodCard",
    COMPANY: "admin.manage.methodCompany",
    QR: "admin.manage.methodQr",
    MANUAL_ONLINE: "admin.manage.methodOnline",
  };
  const statusLabelKeys: Record<string, string> = {
    PENDING: "admin.manage.statusPending",
    CONFIRMED: "admin.manage.statusConfirmed",
    CANCELED: "admin.manage.statusCanceled",
  };
  const methods = ["CASH", "CARD", "COMPANY", "QR", "MANUAL_ONLINE"] as const;
  const dateLocale = getDateLocale();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + HEADER_HEIGHT + 12,
        paddingHorizontal: 24,
        paddingBottom: TAB_BAR_HEIGHT + 16,
        gap: 16,
      }}
    >
      <ActionButton
        icon="plus"
        label={t("admin.manage.sheetNewPayment")}
        onPress={() => setShowCreate(true)}
      />
      {billingQuery.isError ? (
        <ErrorState message={t("admin.manage.billingError")} />
      ) : null}
      {records.length === 0 && !billingQuery.isLoading ? (
        <EmptyState title={t("admin.manage.billingEmpty")} />
      ) : null}

      {records.length > 0 ? (
        <YStack height={400}>
          <LegendList
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: BillingRecord }) => (
              <YStack px="$1" py="$1.5">
                <Card>
                  <YStack gap="$2">
                    <XStack justify="space-between" items="center">
                      <Text fontWeight="800" fontSize="$6" color="$color">
                        {item.amount} RSD
                      </Text>
                      <Badge
                        color={
                          item.status === "CONFIRMED" ? "$accent1" : "$accent8"
                        }
                      >
                        {statusLabelKeys[item.status]
                          ? t(statusLabelKeys[item.status])
                          : item.status}
                      </Badge>
                    </XStack>
                    <XStack justify="space-between" items="center">
                      <Text fontSize="$2" color="$color10">
                        {methodLabelKeys[item.method]
                          ? t(methodLabelKeys[item.method])
                          : item.method}
                      </Text>
                      <Text fontSize="$2" color="$color9">
                        {new Date(item.createdAt).toLocaleDateString(
                          dateLocale,
                        )}
                      </Text>
                    </XStack>
                    {item.notes ? (
                      <Text fontSize="$2" color="$color9">
                        {item.notes}
                      </Text>
                    ) : null}
                  </YStack>
                </Card>
              </YStack>
            )}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              billingQuery.isFetchingNextPage ? (
                <ActivityIndicator style={{ padding: 16 }} />
              ) : null
            }
          />
        </YStack>
      ) : null}

      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <ScrollView>
          <YStack gap="$4">
            <Text
              fontSize="$6"
              fontWeight="700"
              color="$color"
              letterSpacing={-0.3}
            >
              {t("admin.manage.sheetNewPayment")}
            </Text>
            <SectionLabel>{t("admin.manage.client")}</SectionLabel>
            {(clientsQuery.data?.clients ?? []).map((c) => (
              <Button
                key={c.user.id}
                size="small"
                variant={
                  form.clientUserId === c.user.id ? "primary" : "secondary"
                }
                onPress={() =>
                  setForm((s) => ({ ...s, clientUserId: c.user.id }))
                }
              >
                {c.user.fullName}
              </Button>
            ))}
            <Input
              placeholder={t("admin.manage.placeholderAmount")}
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(v) => setForm((s) => ({ ...s, amount: v }))}
            />
            <SectionLabel>{t("admin.manage.paymentMethod")}</SectionLabel>
            <XStack gap="$3" flexWrap="wrap">
              {methods.map((m) => (
                <Button
                  key={m}
                  size="small"
                  variant={form.method === m ? "primary" : "secondary"}
                  onPress={() => setForm((s) => ({ ...s, method: m }))}
                >
                  {t(methodLabelKeys[m])}
                </Button>
              ))}
            </XStack>
            <SectionLabel>{t("admin.manage.packageOptional")}</SectionLabel>
            {(packageTypesQuery.data?.packageTypes ?? []).map((pt) => (
              <Button
                key={pt.id}
                size="small"
                variant={
                  form.packageTypeId === pt.id ? "primary" : "secondary"
                }
                onPress={() =>
                  setForm((s) => ({
                    ...s,
                    packageTypeId:
                      form.packageTypeId === pt.id ? "" : pt.id,
                  }))
                }
              >
                {pt.name}
              </Button>
            ))}
            <Input
              placeholder={t("admin.manage.placeholderNotes")}
              value={form.notes}
              onChangeText={(v) => setForm((s) => ({ ...s, notes: v }))}
            />
            <Button
              disabled={
                createMutation.isPending || !form.clientUserId || !form.amount
              }
              onPress={() =>
                createMutation.mutate({
                  clientUserId: form.clientUserId,
                  amount: parseInt(form.amount, 10),
                  method: form.method,
                  notes: form.notes || undefined,
                  packageTypeId: form.packageTypeId || undefined,
                  activatePackageOnConfirm: !!form.packageTypeId,
                })
              }
            >
              {t("admin.manage.create")}
            </Button>
            {createMutation.isError ? (
              <ErrorState message={t("admin.manage.createPaymentError")} />
            ) : null}
          </YStack>
        </ScrollView>
      </AppSheet>
    </ScrollView>
  );
}
