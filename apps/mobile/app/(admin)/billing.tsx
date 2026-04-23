/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — period selector, hero revenue, transaction list detail
 */
import { useState, useMemo } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "moti";
import { LegendList } from "@legendapp/list";
import { getDateLocale } from "@/lib/i18n";
import { ActionButton } from "@/components/ui/action-button";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroCard } from "@/components/ui/hero-card";
import { NumberRollup } from "@/components/ui/number-rollup";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionLabel } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  type BillingRecord,
} from "@/lib/queries/billing-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { TAB_BAR_HEIGHT, HEADER_HEIGHT } from "@/components/ui/constants";

type FilterTab = "all" | "confirmed" | "canceled" | "pending";

export default function AdminBilling() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs());
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: t("admin.manage.filterAll") },
    { value: "confirmed", label: t("admin.manage.statusConfirmed") },
    { value: "pending", label: t("admin.manage.statusPending") },
    { value: "canceled", label: t("admin.manage.statusCanceled") },
  ];
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

  const summaryStats = useMemo(() => {
    const confirmed = records.filter((r) => r.status === "CONFIRMED");
    const totalRevenue = confirmed.reduce((sum, r) => sum + r.amount, 0);
    const count = confirmed.length;
    const uniqueClients = new Set(confirmed.map((r) => r.clientUserId)).size;
    const avg = uniqueClients > 0 ? Math.round(totalRevenue / uniqueClients) : 0;
    return { totalRevenue, count, avg };
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (activeFilter === "all") return records;
    if (activeFilter === "confirmed")
      return records.filter((r) => r.status === "CONFIRMED");
    if (activeFilter === "pending")
      return records.filter((r) => r.status === "PENDING");
    if (activeFilter === "canceled")
      return records.filter((r) => r.status === "CANCELED");
    return records;
  }, [records, activeFilter]);

  function navigateBillingMonth(direction: -1 | 1) {
    setSelectedMonth((m) => m.add(direction, "month"));
  }

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

  const periodLabel = selectedMonth.format("MMMM YYYY");

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
      {/* Period selector */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 0 }}
      >
        <View className="flex-row justify-between items-center">
          <FontAwesome
            name="chevron-left"
            size={16}
            color="#a1a1aa"
            onPress={() => navigateBillingMonth(-1)}
          />
          <Text
            className="text-foreground font-bold"
            style={{ fontSize: 18, letterSpacing: -0.3 }}
          >
            {periodLabel}
          </Text>
          <FontAwesome
            name="chevron-right"
            size={16}
            color="#a1a1aa"
            onPress={() => navigateBillingMonth(1)}
          />
        </View>
      </MotiView>

      {/* Hero revenue card */}
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 80 }}
      >
        <HeroCard tone="default">
          <View className="gap-3">
            <SectionLabel>
              {t("admin.manage.totalRevenue")} · {periodLabel}
            </SectionLabel>
            <NumberRollup
              value={summaryStats.totalRevenue}
              formatter={(n) =>
                new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "RSD",
                  maximumFractionDigits: 0,
                }).format(Math.round(n))
              }
              className="text-foreground font-extrabold"
              style={{ fontSize: 44, letterSpacing: -1 }}
            />
            <View className="flex-row gap-4">
              <Text className="text-muted text-sm">
                {summaryStats.count} {t("admin.manage.transactionCount").toLowerCase()}
              </Text>
              <Text className="text-muted text-sm">·</Text>
              <Text className="text-muted text-sm">
                {t("admin.manage.avgPerClient")}{" "}
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "RSD",
                  maximumFractionDigits: 0,
                }).format(summaryStats.avg)}
                /client
              </Text>
            </View>
          </View>
        </HeroCard>
      </MotiView>

      {/* Segmented filter + section label */}
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 350, delay: 160 }}
      >
        <View className="gap-3">
          <SegmentedControl
            options={filterTabs}
            value={activeFilter}
            onChange={setActiveFilter}
          />
          <SectionLabel>{t("admin.manage.transactions") ?? "Transactions"}</SectionLabel>
        </View>
      </MotiView>

      {/* FAB + errors/empty */}
      <ActionButton
        icon="plus"
        label={t("admin.manage.sheetNewPayment")}
        onPress={() => setShowCreate(true)}
      />
      {billingQuery.isError ? (
        <ErrorState message={t("admin.manage.billingError")} />
      ) : null}
      {filteredRecords.length === 0 && !billingQuery.isLoading ? (
        <EmptyState title={t("admin.manage.billingEmpty")} />
      ) : null}

      {/* Transaction list */}
      {filteredRecords.length > 0 ? (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 350, delay: 240 }}
          style={{ height: 400 }}
        >
          <LegendList
            data={filteredRecords}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: BillingRecord }) => (
              <View className="px-1 py-1.5">
                <Card>
                  <View className="flex-col gap-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-foreground font-extrabold" style={{ fontSize: 20 }}>
                        {item.amount} RSD
                      </Text>
                      <Badge
                        status={
                          item.status === "CONFIRMED"
                            ? "success"
                            : item.status === "PENDING"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {statusLabelKeys[item.status]
                          ? t(statusLabelKeys[item.status])
                          : item.status}
                      </Badge>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted" style={{ fontSize: 13 }}>
                        {methodLabelKeys[item.method]
                          ? t(methodLabelKeys[item.method])
                          : item.method}
                      </Text>
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleDateString(
                          dateLocale,
                        )}
                      </Text>
                    </View>
                    {item.notes ? (
                      <Text className="text-muted" style={{ fontSize: 12 }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              </View>
            )}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              billingQuery.isFetchingNextPage ? (
                <ActivityIndicator style={{ padding: 16 }} />
              ) : null
            }
          />
        </MotiView>
      ) : null}

      {/* Create payment sheet — preserved wholesale */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <ScrollView>
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
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
            <View className="flex-row flex-wrap gap-3">
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
            </View>
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
          </View>
        </ScrollView>
      </AppSheet>
    </ScrollView>
  );
}
